CREATE OR REPLACE FUNCTION public.notify_on_delivery_point_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order RECORD;
  v_manager TEXT;
  v_kind TEXT;
  v_title TEXT;
  v_body TEXT;
  v_reason_label TEXT;
  v_wh_name TEXT;
  v_expected TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.dp_status IS NOT DISTINCT FROM NEW.dp_status THEN
    RETURN NEW;
  END IF;

  IF NEW.dp_status NOT IN ('delivered','not_delivered','returned_to_warehouse') THEN
    RETURN NEW;
  END IF;

  SELECT id, order_number, contact_name INTO v_order
    FROM public.orders WHERE id = NEW.order_id;
  IF v_order.id IS NULL THEN RETURN NEW; END IF;

  -- Попытка найти менеджера по совпадению имени контакта с клиентом
  SELECT manager_name INTO v_manager
    FROM public.clients
   WHERE name = v_order.contact_name
   LIMIT 1;

  IF NEW.dp_status = 'delivered' THEN
    v_kind := 'order_delivered';
    v_title := 'Заказ доставлен';
    v_body := 'Заказ №' || v_order.order_number || ' доставлен';
  ELSIF NEW.dp_status = 'not_delivered' THEN
    v_kind := 'order_failed';
    v_title := 'Заказ не доставлен';
    v_reason_label := CASE NEW.dp_undelivered_reason::text
      WHEN 'client_absent' THEN 'клиента нет'
      WHEN 'client_no_answer' THEN 'клиент не отвечает'
      WHEN 'no_payment' THEN 'нет оплаты'
      WHEN 'no_qr' THEN 'нет QR-кода'
      WHEN 'client_refused' THEN 'отказ клиента'
      WHEN 'no_unloading' THEN 'нет возможности выгрузки'
      WHEN 'defective' THEN 'брак'
      WHEN 'other' THEN 'другое'
      ELSE 'не указана'
    END;
    v_body := 'Заказ №' || v_order.order_number || ' не доставлен. Причина: ' || v_reason_label;
  ELSE -- returned_to_warehouse
    v_kind := 'order_returned';
    v_title := 'Возврат на склад';
    SELECT name INTO v_wh_name FROM public.warehouses WHERE id = NEW.dp_return_warehouse_id;
    v_expected := CASE
      WHEN NEW.dp_expected_return_at IS NOT NULL
        THEN to_char(NEW.dp_expected_return_at AT TIME ZONE 'UTC', 'DD.MM.YYYY HH24:MI')
      ELSE 'не указано'
    END;
    v_body := 'Заказ №' || v_order.order_number ||
              ' возвращается на склад' ||
              COALESCE(' «' || v_wh_name || '»','') ||
              '. Ожидаемое время возврата: ' || v_expected;
  END IF;

  INSERT INTO public.notifications (kind, title, body, order_id, payload)
  VALUES (
    v_kind,
    v_title,
    v_body,
    NEW.order_id,
    jsonb_build_object(
      'order_number', v_order.order_number,
      'point_id', NEW.id,
      'route_id', NEW.route_id,
      'dp_status', NEW.dp_status,
      'reason', NEW.dp_undelivered_reason,
      'reason_label', v_reason_label,
      'return_warehouse_id', NEW.dp_return_warehouse_id,
      'return_warehouse_name', v_wh_name,
      'return_comment', NEW.dp_return_comment,
      'expected_return_at', NEW.dp_expected_return_at,
      'manager_name', v_manager,
      'changed_by', NEW.dp_status_changed_by
    )
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_route_points_notify ON public.route_points;
CREATE TRIGGER trg_route_points_notify
AFTER UPDATE OF dp_status ON public.route_points
FOR EACH ROW EXECUTE FUNCTION public.notify_on_delivery_point_status();
