-- When delivery point becomes returned_to_warehouse, set order status to awaiting_return.
-- When order status becomes return_accepted, no extra side effects (manual via UI).
CREATE OR REPLACE FUNCTION public.sync_order_on_return_to_warehouse()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.dp_status = 'returned_to_warehouse'
     AND (TG_OP = 'INSERT' OR OLD.dp_status IS DISTINCT FROM NEW.dp_status) THEN
    UPDATE public.orders
       SET status = 'awaiting_return'::order_status,
           updated_at = now()
     WHERE id = NEW.order_id
       AND status NOT IN ('return_accepted','cancelled');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_route_points_return_to_warehouse ON public.route_points;
CREATE TRIGGER trg_route_points_return_to_warehouse
AFTER INSERT OR UPDATE OF dp_status ON public.route_points
FOR EACH ROW
EXECUTE FUNCTION public.sync_order_on_return_to_warehouse();

-- Extend notify_on_order_status to also cover return statuses
CREATE OR REPLACE FUNCTION public.notify_on_order_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind text;
  v_title text;
  v_body text;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'delivered' THEN
      v_kind := 'order_delivered'; v_title := 'Заказ доставлен';
      v_body := 'Заказ ' || NEW.order_number;
    ELSIF NEW.status = 'not_delivered' THEN
      v_kind := 'order_failed'; v_title := 'Заказ не доставлен';
      v_body := 'Заказ ' || NEW.order_number;
    ELSIF NEW.status = 'awaiting_resend' THEN
      v_kind := 'order_returned'; v_title := 'Возврат на склад';
      v_body := 'Заказ ' || NEW.order_number;
    ELSIF NEW.status = 'awaiting_return' THEN
      v_kind := 'order_awaiting_return';
      v_title := 'Ожидает возврата на склад';
      v_body := 'Заказ №' || NEW.order_number || ' возвращается на склад. Адресаты: менеджер, логист, начальник склада.';
    ELSIF NEW.status = 'return_accepted' THEN
      v_kind := 'order_return_accepted';
      v_title := 'Возврат принят складом';
      v_body := 'Заказ №' || NEW.order_number || ' — возврат принят складом.';
    ELSE
      RETURN NEW;
    END IF;
    INSERT INTO public.notifications (kind, title, body, order_id, payload)
    VALUES (
      v_kind, v_title, v_body, NEW.id,
      jsonb_build_object(
        'order_number', NEW.order_number,
        'status', NEW.status,
        'recipients', jsonb_build_array('manager','logistician','warehouse_chief')
      )
    );
  END IF;
  RETURN NEW;
END;
$$;