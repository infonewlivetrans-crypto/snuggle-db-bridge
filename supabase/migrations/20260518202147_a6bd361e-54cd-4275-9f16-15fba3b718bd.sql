CREATE OR REPLACE FUNCTION public.admin_bulk_delete_orders(p_order_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_order RECORD;
  v_deleted_orders jsonb := '[]'::jsonb;
  v_errors jsonb := '[]'::jsonb;
  v_deleted_routes jsonb := '[]'::jsonb;
  v_deleted_delivery_routes jsonb := '[]'::jsonb;
  v_blocked_routes jsonb := '[]'::jsonb;
  v_affected_route_ids uuid[] := ARRAY[]::uuid[];
  v_route_id uuid;
  v_route_number text;
  v_remaining_points int;
  v_active_dr int;
  v_dr RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'unauthorized', 'message', 'unauthorized');
  END IF;
  IF NOT public.has_role(v_uid, 'admin'::public.app_role) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden', 'message', 'forbidden');
  END IF;
  IF p_order_ids IS NULL OR array_length(p_order_ids, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'deletedOrders', v_deleted_orders,
      'errors', v_errors,
      'deletedRoutes', v_deleted_routes,
      'deletedDeliveryRoutes', v_deleted_delivery_routes,
      'blockedRoutes', v_blocked_routes
    );
  END IF;
  IF array_length(p_order_ids, 1) > 500 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'too_many', 'message', 'Не более 500 заказов за один запрос');
  END IF;

  FOR v_order IN
    SELECT o.id, o.order_number, o.status::text AS status,
           o.payment_status::text AS payment_status,
           o.cash_received, o.qr_received
      FROM public.orders o
     WHERE o.id = ANY(p_order_ids)
     FOR UPDATE
  LOOP
    IF v_order.cash_received
       OR v_order.qr_received
       OR v_order.payment_status IN ('paid','partial') THEN
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'id', v_order.id,
        'orderNumber', v_order.order_number,
        'reason', 'Получена оплата'
      ));
      CONTINUE;
    END IF;
    IF v_order.status NOT IN ('new','cancelled','excluded_from_route') THEN
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'id', v_order.id,
        'orderNumber', v_order.order_number,
        'reason', 'Заказ уже в работе/доставке/завершён'
      ));
      CONTINUE;
    END IF;

    -- Запоминаем связанные source-маршруты (routes), чтобы потом проверить пустоту.
    SELECT array_agg(DISTINCT rp.route_id)
      INTO STRICT v_affected_route_ids
      FROM (
        SELECT unnest(v_affected_route_ids) AS route_id
        UNION
        SELECT route_id FROM public.route_points WHERE order_id = v_order.id
      ) rp
     WHERE rp.route_id IS NOT NULL;

    -- order_items: FK к orders отсутствует — чистим явно.
    DELETE FROM public.order_items WHERE order_id = v_order.id;

    DELETE FROM public.orders WHERE id = v_order.id;

    v_deleted_orders := v_deleted_orders || jsonb_build_array(jsonb_build_object(
      'id', v_order.id,
      'orderNumber', v_order.order_number
    ));
  END LOOP;

  -- Подчищаем пустые импортированные source-заявки и связанные черновые рейсы.
  IF v_affected_route_ids IS NOT NULL AND array_length(v_affected_route_ids, 1) > 0 THEN
    FOREACH v_route_id IN ARRAY v_affected_route_ids LOOP
      SELECT r.route_number INTO v_route_number
        FROM public.routes r
       WHERE r.id = v_route_id
       FOR UPDATE;
      IF NOT FOUND THEN
        CONTINUE;
      END IF;

      SELECT count(*) INTO v_remaining_points
        FROM public.route_points
       WHERE route_id = v_route_id;

      IF v_remaining_points > 0 THEN
        CONTINUE;
      END IF;

      SELECT count(*) INTO v_active_dr
        FROM public.delivery_routes dr
       WHERE dr.source_request_id = v_route_id
         AND dr.status::text IN ('in_progress','completed');
      IF v_active_dr > 0 THEN
        v_blocked_routes := v_blocked_routes || jsonb_build_array(jsonb_build_object(
          'routeId', v_route_id,
          'routeNumber', v_route_number,
          'reason', 'Рейс доставки в работе или завершён — заявка не удалена'
        ));
        CONTINUE;
      END IF;

      -- Удаляем черновые/выданные рейсы для этой заявки.
      FOR v_dr IN
        SELECT id, route_number
          FROM public.delivery_routes
         WHERE source_request_id = v_route_id
      LOOP
        DELETE FROM public.delivery_routes WHERE id = v_dr.id;
        v_deleted_delivery_routes := v_deleted_delivery_routes || jsonb_build_array(jsonb_build_object(
          'id', v_dr.id,
          'routeNumber', v_dr.route_number
        ));
      END LOOP;

      DELETE FROM public.routes WHERE id = v_route_id;
      v_deleted_routes := v_deleted_routes || jsonb_build_array(jsonb_build_object(
        'id', v_route_id,
        'routeNumber', v_route_number
      ));
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'deletedOrders', v_deleted_orders,
    'errors', v_errors,
    'deletedRoutes', v_deleted_routes,
    'deletedDeliveryRoutes', v_deleted_delivery_routes,
    'blockedRoutes', v_blocked_routes
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_bulk_delete_orders(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_bulk_delete_orders(uuid[]) TO authenticated;