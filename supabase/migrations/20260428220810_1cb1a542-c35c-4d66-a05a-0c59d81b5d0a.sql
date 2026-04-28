
-- Storage bucket для фото точек маршрута
INSERT INTO storage.buckets (id, name, public)
VALUES ('route-point-photos', 'route-point-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Public read policy for the bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'route_point_photos_public_read'
  ) THEN
    CREATE POLICY "route_point_photos_public_read"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'route-point-photos');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'route_point_photos_public_insert'
  ) THEN
    CREATE POLICY "route_point_photos_public_insert"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'route-point-photos');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'route_point_photos_public_update'
  ) THEN
    CREATE POLICY "route_point_photos_public_update"
      ON storage.objects FOR UPDATE
      USING (bucket_id = 'route-point-photos');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'route_point_photos_public_delete'
  ) THEN
    CREATE POLICY "route_point_photos_public_delete"
      ON storage.objects FOR DELETE
      USING (bucket_id = 'route-point-photos');
  END IF;
END $$;

-- Тип фото для точки маршрута
DO $$ BEGIN
  CREATE TYPE public.route_point_photo_kind AS ENUM (
    'qr',
    'signed_docs',
    'payment',
    'problem',
    'unloading_place'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Таблица фото точки маршрута
CREATE TABLE IF NOT EXISTS public.route_point_photos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  route_point_id UUID NOT NULL,
  order_id UUID,
  kind public.route_point_photo_kind NOT NULL,
  file_url TEXT NOT NULL,
  storage_path TEXT,
  comment TEXT,
  uploaded_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rpp_route_point ON public.route_point_photos(route_point_id);
CREATE INDEX IF NOT EXISTS idx_rpp_order ON public.route_point_photos(order_id);
CREATE INDEX IF NOT EXISTS idx_rpp_kind ON public.route_point_photos(kind);

ALTER TABLE public.route_point_photos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Anyone can view route_point_photos"
    ON public.route_point_photos FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Anyone can insert route_point_photos"
    ON public.route_point_photos FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Anyone can update route_point_photos"
    ON public.route_point_photos FOR UPDATE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Anyone can delete route_point_photos"
    ON public.route_point_photos FOR DELETE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Обновить триггер уведомлений: добавить ссылки на фото
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

  -- Собираем фото
  SELECT COALESCE(jsonb_agg(jsonb_build_object('kind', kind, 'url', file_url) ORDER BY created_at), '[]'::jsonb),
         COUNT(*)
    INTO v_photos, v_photo_count
    FROM public.route_point_photos
   WHERE route_point_id = NEW.id;
  IF v_photo_count > 0 THEN
    v_photos_line := ' Фото: ' || v_photo_count || ' шт.';
  END IF;

  IF NEW.dp_status = 'delivered' THEN
    v_kind := 'order_delivered';
    v_title := 'Заказ доставлен';
    v_body := 'Заказ №' || v_order.order_number || ' доставлен.' || v_qr_line || v_payment_line || v_photos_line;
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
    v_body := 'Заказ №' || v_order.order_number || ' не доставлен. Причина: ' || v_reason_label || '.' || v_qr_line || v_payment_line || v_photos_line;
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
              '. Ожидаемое время возврата: ' || v_expected || '.' || v_qr_line || v_payment_line || v_photos_line;
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
      'photos_count', v_photo_count
    )
  );
  RETURN NEW;
END $function$;
