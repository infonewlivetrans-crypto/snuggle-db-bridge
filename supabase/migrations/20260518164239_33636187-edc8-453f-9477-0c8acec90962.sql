CREATE OR REPLACE FUNCTION public.admin_delete_route(p_route_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_route record;
  v_active_count int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'unauthorized', 'message', 'unauthorized');
  END IF;

  IF NOT public.has_role(v_uid, 'admin'::public.app_role) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden', 'message', 'forbidden');
  END IF;

  SELECT r.id,
         r.route_number,
         r.status::text       AS status,
         r.request_status::text AS request_status
    INTO v_route
  FROM public.routes r
  WHERE r.id = p_route_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found', 'message', 'Заявка не найдена');
  END IF;

  IF v_route.status IN ('in_progress', 'completed') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'not_deletable_status',
      'message', 'Нельзя удалить заявку: маршрут уже в работе или завершён.',
      'route_number', v_route.route_number,
      'status', v_route.status
    );
  END IF;

  -- Активные (нечерновые) рейсы доставки, связанные с заявкой.
  SELECT count(*) INTO v_active_count
  FROM public.delivery_routes dr
  WHERE dr.source_request_id = p_route_id
    AND dr.status::text IN ('formed', 'issued', 'in_progress', 'completed');

  IF v_active_count > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'has_active_delivery_routes',
      'message', format(
        'Нельзя удалить заявку: по ней есть активные рейсы доставки (%s). Сначала удалите или переведите рейсы в черновик.',
        v_active_count
      ),
      'active_count', v_active_count
    );
  END IF;

  -- Удаляем черновики delivery_routes (FK на routes отсутствует).
  DELETE FROM public.delivery_routes
   WHERE source_request_id = p_route_id;

  -- Сама заявка. route_points / route_offers / route_carrier_* имеют
  -- ON DELETE CASCADE на routes.
  DELETE FROM public.routes
   WHERE id = p_route_id;

  RETURN jsonb_build_object(
    'ok', true,
    'route_number', v_route.route_number,
    'status', v_route.status,
    'request_status', v_route.request_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_route(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_route(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
