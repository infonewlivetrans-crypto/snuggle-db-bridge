
-- SECURITY DEFINER RPCs для trip-stage, чтобы водительский кабинет не зависел
-- от SUPABASE_SERVICE_ROLE_KEY на VPS.

CREATE OR REPLACE FUNCTION public._trip_stage_can_write(_user_id uuid, _delivery_route_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin'::app_role)
    OR public.has_role(_user_id, 'logist'::app_role)
    OR public.has_role(_user_id, 'manager'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.delivery_routes dr
      JOIN public.drivers d ON d.id = dr.driver_id
      WHERE dr.id = _delivery_route_id
        AND d.user_id = _user_id
    );
$$;

CREATE OR REPLACE FUNCTION public.driver_record_stage_event(
  p_delivery_route_id uuid,
  p_stage trip_stage,
  p_comment text DEFAULT NULL,
  p_gps_lat double precision DEFAULT NULL,
  p_gps_lng double precision DEFAULT NULL,
  p_actor_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_route record;
  v_current trip_stage;
  v_expected trip_stage;
  v_new_stage trip_stage;
  v_ts_field text;
  v_patch jsonb := '{}'::jsonb;
  v_route_label text;
  v_driver text;
  v_stage_label text;
  v_body text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF p_delivery_route_id IS NULL THEN
    RAISE EXCEPTION 'deliveryRouteId обязателен' USING ERRCODE = '22023';
  END IF;
  IF p_stage NOT IN ('arrived_loading','loaded','departed','finished','cash_returned') THEN
    RAISE EXCEPTION 'Недопустимый этап' USING ERRCODE = '22023';
  END IF;
  IF NOT public._trip_stage_can_write(v_uid, p_delivery_route_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT id, current_stage, route_number, assigned_driver, source_request_id
    INTO v_route
  FROM public.delivery_routes
  WHERE id = p_delivery_route_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Маршрут не найден' USING ERRCODE = 'P0002';
  END IF;

  v_current := COALESCE(v_route.current_stage, 'not_started'::trip_stage);

  -- expected = nextStage(current)
  v_expected := CASE v_current
    WHEN 'not_started'      THEN 'arrived_loading'::trip_stage
    WHEN 'arrived_loading'  THEN 'loaded'::trip_stage
    WHEN 'loaded'           THEN 'departed'::trip_stage
    WHEN 'departed'         THEN 'finished'::trip_stage
    WHEN 'in_progress'      THEN 'finished'::trip_stage
    WHEN 'finished'         THEN 'cash_returned'::trip_stage
    ELSE NULL
  END;

  IF v_expected IS DISTINCT FROM p_stage THEN
    RAISE EXCEPTION
      'Недопустимый переход: текущий этап %, ожидается %, получено %',
      v_current, COALESCE(v_expected::text,'—'), p_stage
      USING ERRCODE = '22023';
  END IF;

  -- applyStage: departed -> in_progress
  v_new_stage := CASE WHEN p_stage = 'departed'::trip_stage
                      THEN 'in_progress'::trip_stage
                      ELSE p_stage END;

  INSERT INTO public.route_stage_events(
    delivery_route_id, stage, occurred_at, actor_user_id, actor_name,
    comment, gps_lat, gps_lng
  ) VALUES (
    p_delivery_route_id, p_stage, v_now, v_uid, NULLIF(btrim(p_actor_name),''),
    NULLIF(btrim(p_comment),''), p_gps_lat, p_gps_lng
  );

  v_ts_field := CASE p_stage
    WHEN 'arrived_loading' THEN 'arrived_loading_at'
    WHEN 'loaded'          THEN 'loaded_at'
    WHEN 'departed'        THEN 'departed_at'
    WHEN 'finished'        THEN 'finished_at'
    WHEN 'cash_returned'   THEN 'cash_returned_at'
    ELSE NULL
  END;

  UPDATE public.delivery_routes SET
    current_stage      = v_new_stage,
    arrived_loading_at = CASE WHEN v_ts_field = 'arrived_loading_at' THEN v_now ELSE arrived_loading_at END,
    loaded_at          = CASE WHEN v_ts_field = 'loaded_at'          THEN v_now ELSE loaded_at END,
    departed_at        = CASE WHEN v_ts_field = 'departed_at'        THEN v_now ELSE departed_at END,
    finished_at        = CASE WHEN v_ts_field = 'finished_at'        THEN v_now ELSE finished_at END,
    cash_returned_at   = CASE WHEN v_ts_field = 'cash_returned_at'   THEN v_now ELSE cash_returned_at END,
    status             = CASE WHEN p_stage = 'finished'::trip_stage
                              THEN 'completed'::delivery_route_status
                              ELSE status END,
    updated_at         = v_now
  WHERE id = p_delivery_route_id;

  v_route_label := COALESCE(v_route.route_number, substring(p_delivery_route_id::text, 1, 8));
  v_driver := COALESCE(NULLIF(btrim(p_actor_name),''), v_route.assigned_driver, 'Водитель');
  v_stage_label := CASE p_stage
    WHEN 'arrived_loading' THEN 'Прибыл на загрузку'
    WHEN 'loaded'          THEN 'Загрузился'
    WHEN 'departed'        THEN 'Выехал на линию'
    WHEN 'finished'        THEN 'Завершил рейс'
    WHEN 'cash_returned'   THEN 'Вернул деньги / закрыл кассу'
    ELSE p_stage::text
  END;
  v_body := v_driver || ' • Рейс ' || v_route_label || ': ' || v_stage_label
            || COALESCE(' — ' || NULLIF(btrim(p_comment),''), '');

  BEGIN
    INSERT INTO public.notifications(kind, title, body, route_id, payload)
    VALUES (
      'trip_stage_changed',
      'Рейс ' || v_route_label || ': ' || v_stage_label,
      v_body,
      v_route.source_request_id,
      jsonb_build_object(
        'delivery_route_id', p_delivery_route_id,
        'stage', p_stage,
        'new_stage', v_new_stage,
        'previous_stage', v_current,
        'occurred_at', v_now,
        'actor_name', v_driver,
        'actor_user_id', v_uid,
        'comment', NULLIF(btrim(p_comment),''),
        'gps', CASE WHEN p_gps_lat IS NOT NULL AND p_gps_lng IS NOT NULL
                    THEN jsonb_build_object('lat', p_gps_lat, 'lng', p_gps_lng)
                    ELSE NULL END
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- не валим основную операцию из-за уведомления
    NULL;
  END;

  v_patch := jsonb_build_object(
    'ok', true,
    'stage', p_stage,
    'new_stage', v_new_stage,
    'previous_stage', v_current,
    'occurred_at', v_now
  );
  RETURN v_patch;
END
$$;

CREATE OR REPLACE FUNCTION public.driver_record_route_return(
  p_delivery_route_id uuid,
  p_order_id uuid,
  p_reason text,
  p_comment text DEFAULT NULL,
  p_actor_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF p_delivery_route_id IS NULL THEN
    RAISE EXCEPTION 'deliveryRouteId обязателен' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Укажите причину возврата' USING ERRCODE = '22023';
  END IF;
  IF NOT public._trip_stage_can_write(v_uid, p_delivery_route_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.route_returns(
    delivery_route_id, order_id, reason, comment, actor_user_id, actor_name
  ) VALUES (
    p_delivery_route_id, p_order_id, btrim(p_reason),
    NULLIF(btrim(p_comment),''), v_uid, NULLIF(btrim(p_actor_name),'')
  );
  RETURN jsonb_build_object('ok', true);
END
$$;

GRANT EXECUTE ON FUNCTION public._trip_stage_can_write(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.driver_record_stage_event(uuid, trip_stage, text, double precision, double precision, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.driver_record_route_return(uuid, uuid, text, text, text) TO authenticated;
