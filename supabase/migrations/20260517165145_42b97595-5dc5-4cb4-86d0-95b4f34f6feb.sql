CREATE OR REPLACE FUNCTION public.admin_delete_delivery_route(p_route_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_route record;
  v_source_id uuid;
  v_points_count int;
  v_remaining_drs int;
  v_source_cleanup text := 'none';
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'unauthorized', 'message', 'unauthorized');
  END IF;

  IF NOT public.has_role(v_uid, 'admin'::public.app_role) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden', 'message', 'forbidden');
  END IF;

  SELECT dr.id,
         dr.route_number,
         dr.status::text AS status,
         dr.current_stage::text AS current_stage,
         dr.source_request_id
    INTO v_route
  FROM public.delivery_routes dr
  WHERE dr.id = p_route_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found', 'message', 'Рейс не найден');
  END IF;

  IF v_route.status IN ('issued', 'in_progress', 'completed') THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'not_deletable_status',
      'message', 'Нельзя удалить рейс: он уже выпущен, в пути или завершён.',
      'route_number', v_route.route_number,
      'status', v_route.status,
      'current_stage', v_route.current_stage
    );
  END IF;

  IF v_route.current_stage IS NOT NULL AND v_route.current_stage <> 'not_started' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'stage_started',
      'message', 'Нельзя удалить рейс: водитель уже начал работу по этапам маршрута.',
      'route_number', v_route.route_number,
      'status', v_route.status,
      'current_stage', v_route.current_stage
    );
  END IF;

  DELETE FROM public.driver_locations WHERE delivery_route_id = p_route_id;
  DELETE FROM public.route_stage_events WHERE delivery_route_id = p_route_id;
  DELETE FROM public.route_returns WHERE delivery_route_id = p_route_id;
  DELETE FROM public.route_order_exclusions WHERE delivery_route_id = p_route_id;
  DELETE FROM public.delivery_routes WHERE id = p_route_id;

  -- Cleanup / reset source request so that re-creation works.
  v_source_id := v_route.source_request_id;
  IF v_source_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_remaining_drs
      FROM public.delivery_routes
      WHERE source_request_id = v_source_id;

    IF v_remaining_drs = 0 THEN
      SELECT COUNT(*) INTO v_points_count
        FROM public.route_points
        WHERE route_id = v_source_id;

      IF v_points_count = 0 THEN
        -- Pure placeholder routes row (e.g. CreateManualDeliveryRouteDialog) — remove it
        -- so that its route_number is freed and the legacy /routes list does not show a ghost.
        DELETE FROM public.transport_request_status_history WHERE route_id = v_source_id;
        DELETE FROM public.routes WHERE id = v_source_id;
        v_source_cleanup := 'source_deleted';
      ELSE
        -- Real transport request with attached orders — reset request_status to draft
        -- so the request becomes available for forming a new delivery route again.
        UPDATE public.routes
        SET request_status = 'draft'::public.transport_request_status,
            request_status_changed_by = 'Система',
            request_status_changed_at = now(),
            request_status_comment = 'Рейс ' || v_route.route_number || ' удалён, заявка снова доступна для формирования маршрута'
        WHERE id = v_source_id
          AND request_status <> 'draft'::public.transport_request_status;
        v_source_cleanup := 'source_request_reset';
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'deleted',
    'message', 'Рейс удалён',
    'route_id', v_route.id,
    'route_number', v_route.route_number,
    'source_cleanup', v_source_cleanup
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_delivery_route(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_delivery_route(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_delivery_route(uuid) TO authenticated;