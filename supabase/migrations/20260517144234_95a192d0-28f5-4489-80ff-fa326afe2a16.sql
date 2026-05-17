CREATE OR REPLACE FUNCTION public.admin_delete_delivery_route(p_route_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_route record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'unauthorized',
      'message', 'unauthorized'
    );
  END IF;

  IF NOT public.has_role(v_uid, 'admin'::public.app_role) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'forbidden',
      'message', 'forbidden'
    );
  END IF;

  SELECT dr.id, dr.route_number, dr.status::text AS status, dr.current_stage::text AS current_stage
    INTO v_route
  FROM public.delivery_routes dr
  WHERE dr.id = p_route_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'not_found',
      'message', 'Рейс не найден'
    );
  END IF;

  IF v_route.status IN ('issued', 'in_progress', 'completed') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'not_deletable_status',
      'message', 'Нельзя удалить рейс: он уже выпущен, в пути или завершён.',
      'route_number', v_route.route_number,
      'status', v_route.status,
      'current_stage', v_route.current_stage
    );
  END IF;

  IF v_route.current_stage IS NOT NULL AND v_route.current_stage <> 'not_started' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'stage_started',
      'message', 'Нельзя удалить рейс: водитель уже начал работу по этапам маршрута.',
      'route_number', v_route.route_number,
      'status', v_route.status,
      'current_stage', v_route.current_stage
    );
  END IF;

  DELETE FROM public.driver_locations
  WHERE delivery_route_id = p_route_id;

  DELETE FROM public.route_stage_events
  WHERE delivery_route_id = p_route_id;

  DELETE FROM public.route_returns
  WHERE delivery_route_id = p_route_id;

  DELETE FROM public.route_order_exclusions
  WHERE delivery_route_id = p_route_id;

  DELETE FROM public.delivery_routes
  WHERE id = p_route_id;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'deleted',
    'message', 'Рейс удалён',
    'route_id', v_route.id,
    'route_number', v_route.route_number,
    'status', v_route.status,
    'current_stage', v_route.current_stage
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_delivery_route(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_delivery_route(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_delivery_route(uuid) TO authenticated;