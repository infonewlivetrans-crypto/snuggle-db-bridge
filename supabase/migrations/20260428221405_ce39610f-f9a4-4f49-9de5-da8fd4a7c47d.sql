-- Idle (простой) tracking for route points
DO $$ BEGIN
  CREATE TYPE public.idle_reason AS ENUM (
    'client_absent',
    'client_no_answer',
    'no_unloaders',
    'no_access',
    'no_payment',
    'no_qr',
    'client_asks_wait',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.route_points
  ADD COLUMN IF NOT EXISTS dp_idle_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dp_idle_finished_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dp_idle_duration_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS dp_idle_reason public.idle_reason,
  ADD COLUMN IF NOT EXISTS dp_idle_comment TEXT;

-- Update notification trigger to include idle info
CREATE OR REPLACE FUNCTION public.notify_on_delivery_point_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD;
  v_manager TEXT;
  v_kind TEXT;
  v_title TEXT;
  v_body TEXT;
  v_reason_label TEXT;
  v_wh_name TEXT;
  v_expected TEXT;
  v_diff NUMERIC;
  v_payment_line TEXT := '';
  v_qr_line TEXT := '';
  v_photos JSONB := '[]'::jsonb;
  v_photos_line TEXT := '';
  v_photo_count INT := 0;
  v_idle_line TEXT := '';
  v_idle_reason_label TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.dp_status IS NOT DISTINCT FROM NEW.dp_status THEN
    RETURN NEW;
  END IF;

  IF NEW.dp_status NOT IN ('delivered','not_delivered','returned_to_warehouse') THEN
    RETURN NEW;
  END IF;

  SELECT id, order_number, contact_name, amount_due, requires_qr, qr_received
    INTO v_order
    FROM public.orders WHERE id = NEW.order_id;
  IF v_order.id IS NULL THEN RETURN NEW; END IF;

  SELECT manager_name INTO v_manager
    FROM public.clients
   WHERE name = v_order.contact_name
   LIMIT 1;

  v_qr_line := CASE
    WHEN v_order.requires_qr THEN
      ' QR: ' || CASE WHEN v_order.qr_received THEN 'получен' ELSE 'не получен' END || '.'
    ELSE ''
  END;

  IF v_order.amount_due IS NOT NULL THEN
    v_payment_line := ' К получению: ' || v_order.amount_due::text || '.';
    IF NEW.dp_amount_received IS NOT NULL THEN
      v_payment_line := v_payment_line || ' Получено: ' || NEW.dp_amount_received::text || '.';
      v_diff := NEW.dp_amount_received - v_order.amount_due;
      IF v_diff <> 0 THEN
        v_payment_line := v_payment_line || ' Расхождение: ' ||
          CASE WHEN v_diff > 0 THEN '+' ELSE '' END || v_diff::text || '.';
      END IF;
    END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('kind', kind, 'url', file_url) ORDER BY created_at), '[]'::jsonb),
         COUNT(*)
    INTO v_photos, v_photo_count
    FROM public.route_point_photos
   WHERE route_point_id = NEW.id;
  IF v_photo_count > 0 THEN
    v_photos_line := ' Фото: ' || v_photo_count || ' шт.';
  END IF;

  -- Простой
  IF NEW.dp_idle_duration_minutes IS NOT NULL AND NEW.dp_idle_duration_minutes > 0 THEN
    v_idle_reason_label := CASE NEW.dp_idle_reason::text
      WHEN 'client_absent' THEN 'клиента нет'
      WHEN 'client_no_answer' THEN 'клиент не отвечает'
      WHEN 'no_unloaders' THEN 'нет людей для разгрузки'
      WHEN 'no_access' THEN 'нет подъезда'
      WHEN 'no_payment' THEN 'нет оплаты'
      WHEN 'no_qr' THEN 'нет QR-кода'
      WHEN 'client_asks_wait' THEN 'клиент просит подождать'
      WHEN 'other' THEN 'другое'
      ELSE 'не указана'
    END;
    v_idle_line := ' Простой: ' || NEW.dp_idle_duration_minutes || ' мин (' || v_idle_reason_label || ').';
  END IF;

  IF NEW.dp_status = 'delivered' THEN
    v_kind := 'order_delivered';
    v_title := 'Заказ доставлен';
    v_body := 'Заказ №' || v_order.order_number || ' доставлен.' || v_qr_line || v_payment_line || v_photos_line || v_idle_line;
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
    v_body := 'Заказ №' || v_order.order_number || ' не доставлен. Причина: ' || v_reason_label || '.' || v_qr_line || v_payment_line || v_photos_line || v_idle_line;
  ELSE
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
              '. Ожидаемое время возврата: ' || v_expected || '.' || v_qr_line || v_payment_line || v_photos_line || v_idle_line;
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
      'changed_by', NEW.dp_status_changed_by,
      'requires_qr', v_order.requires_qr,
      'qr_received', v_order.qr_received,
      'amount_due', v_order.amount_due,
      'amount_received', NEW.dp_amount_received,
      'amount_diff', v_diff,
      'payment_comment', NEW.dp_payment_comment,
      'photos', v_photos,
      'photos_count', v_photo_count,
      'idle_started_at', NEW.dp_idle_started_at,
      'idle_finished_at', NEW.dp_idle_finished_at,
      'idle_duration_minutes', NEW.dp_idle_duration_minutes,
      'idle_reason', NEW.dp_idle_reason,
      'idle_reason_label', v_idle_reason_label,
      'idle_comment', NEW.dp_idle_comment
    )
  );
  RETURN NEW;
END $function$;