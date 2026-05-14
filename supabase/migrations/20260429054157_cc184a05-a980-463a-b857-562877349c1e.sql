-- Триггер: при переводе delivery_routes в completed создаём уведомление-отчёт
CREATE OR REPLACE FUNCTION public.notify_on_delivery_route_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orders JSONB := '[]'::jsonb;
  v_total INT := 0;
  v_delivered INT := 0;
  v_not_delivered INT := 0;
  v_returned INT := 0;
  v_amount_due NUMERIC := 0;
  v_amount_received NUMERIC := 0;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.status = 'completed'::delivery_route_status
     AND OLD.status IS DISTINCT FROM NEW.status THEN

    -- Агрегируем точки маршрута
    SELECT
      COALESCE(jsonb_agg(jsonb_build_object(
        'order_id', o.id,
        'order_number', o.order_number,
        'contact_name', o.contact_name,
        'delivery_address', o.delivery_address,
        'dp_status', rp.dp_status,
        'undelivered_reason', rp.dp_undelivered_reason,
        'amount_due', o.amount_due,
        'amount_received', rp.dp_amount_received,
        'amount_diff', COALESCE(rp.dp_amount_received,0) - COALESCE(o.amount_due,0),
        'requires_qr', o.requires_qr,
        'qr_received', o.qr_received,
        'cash_received', o.cash_received,
        'payment_comment', rp.dp_payment_comment,
        'order_comment', o.comment,
        'photos', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object('kind', kind, 'url', file_url) ORDER BY created_at), '[]'::jsonb)
          FROM public.route_point_photos
          WHERE route_point_id = rp.id
        )
      ) ORDER BY rp.point_number), '[]'::jsonb),
      COUNT(*),
      COUNT(*) FILTER (WHERE rp.dp_status = 'delivered'),
      COUNT(*) FILTER (WHERE rp.dp_status = 'not_delivered'),
      COUNT(*) FILTER (WHERE rp.dp_status = 'returned_to_warehouse'),
      COALESCE(SUM(o.amount_due), 0),
      COALESCE(SUM(rp.dp_amount_received), 0)
    INTO v_orders, v_total, v_delivered, v_not_delivered, v_returned, v_amount_due, v_amount_received
    FROM public.route_points rp
    JOIN public.orders o ON o.id = rp.order_id
    WHERE rp.route_id = NEW.source_request_id;

    INSERT INTO public.notifications (kind, title, body, route_id, payload)
    VALUES (
      'route_completed_report',
      'Маршрут завершён',
      'Маршрут №' || NEW.route_number || ' завершён. Отчёт готов.',
      NEW.source_request_id,
      jsonb_build_object(
        'delivery_route_id', NEW.id,
        'route_number', NEW.route_number,
        'route_date', NEW.route_date,
        'driver', NEW.assigned_driver,
        'vehicle', NEW.assigned_vehicle,
        'totals', jsonb_build_object(
          'total', v_total,
          'delivered', v_delivered,
          'not_delivered', v_not_delivered,
          'returned', v_returned,
          'amount_due', v_amount_due,
          'amount_received', v_amount_received,
          'amount_diff', v_amount_received - v_amount_due
        ),
        'orders', v_orders
      )
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_delivery_route_completed ON public.delivery_routes;
CREATE TRIGGER trg_notify_delivery_route_completed
AFTER UPDATE ON public.delivery_routes
FOR EACH ROW EXECUTE FUNCTION public.notify_on_delivery_route_completed();