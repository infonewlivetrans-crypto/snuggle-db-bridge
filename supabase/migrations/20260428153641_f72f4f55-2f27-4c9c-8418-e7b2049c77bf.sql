-- 1. QR photo storage on orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS qr_photo_url text,
  ADD COLUMN IF NOT EXISTS qr_photo_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS qr_photo_uploaded_by text;

-- 2. Storage bucket for QR photos (public read for simplicity)
INSERT INTO storage.buckets (id, name, public)
VALUES ('qr-photos', 'qr-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "QR photos public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'qr-photos');

CREATE POLICY "QR photos public insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'qr-photos');

CREATE POLICY "QR photos public update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'qr-photos');

-- 3. Notifications table (manager bell)
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,                -- 'qr_uploaded' | 'order_delivered' | 'order_failed' | 'order_returned' | 'payment_received'
  title text NOT NULL,
  body text,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  route_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_created_idx ON public.notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON public.notifications (is_read, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view notifications" ON public.notifications FOR SELECT USING (true);
CREATE POLICY "Anyone can insert notifications" ON public.notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update notifications" ON public.notifications FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete notifications" ON public.notifications FOR DELETE USING (true);

-- 4. Block closing point as 'completed' if QR required but missing
CREATE OR REPLACE FUNCTION public.enforce_qr_before_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requires_qr boolean;
  v_qr_url text;
BEGIN
  IF NEW.status = 'completed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    SELECT requires_qr, qr_photo_url INTO v_requires_qr, v_qr_url
    FROM public.orders WHERE id = NEW.order_id;
    IF v_requires_qr AND (v_qr_url IS NULL OR length(trim(v_qr_url)) = 0) THEN
      RAISE EXCEPTION 'Для этого заказа требуется QR-код. Загрузите фото QR перед закрытием доставки.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_qr_before_complete ON public.route_points;
CREATE TRIGGER trg_enforce_qr_before_complete
  BEFORE INSERT OR UPDATE OF status ON public.route_points
  FOR EACH ROW EXECUTE FUNCTION public.enforce_qr_before_complete();

-- 5. Notify on QR upload + on order status change
CREATE OR REPLACE FUNCTION public.notify_on_qr_upload()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (OLD.qr_photo_url IS NULL OR OLD.qr_photo_url = '')
     AND NEW.qr_photo_url IS NOT NULL AND NEW.qr_photo_url <> '' THEN
    INSERT INTO public.notifications (kind, title, body, order_id, payload)
    VALUES (
      'qr_uploaded',
      'QR-код загружен',
      'Заказ ' || NEW.order_number || ' — водитель прикрепил фото QR-кода',
      NEW.id,
      jsonb_build_object('order_number', NEW.order_number, 'qr_photo_url', NEW.qr_photo_url)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_qr_upload ON public.orders;
CREATE TRIGGER trg_notify_on_qr_upload
  AFTER UPDATE OF qr_photo_url ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_qr_upload();

CREATE OR REPLACE FUNCTION public.notify_on_order_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind text;
  v_title text;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'delivered' THEN
      v_kind := 'order_delivered';
      v_title := 'Заказ доставлен';
    ELSIF NEW.status = 'not_delivered' THEN
      v_kind := 'order_failed';
      v_title := 'Заказ не доставлен';
    ELSIF NEW.status = 'awaiting_resend' THEN
      v_kind := 'order_returned';
      v_title := 'Возврат на склад';
    ELSE
      RETURN NEW;
    END IF;
    INSERT INTO public.notifications (kind, title, body, order_id, payload)
    VALUES (
      v_kind,
      v_title,
      'Заказ ' || NEW.order_number,
      NEW.id,
      jsonb_build_object('order_number', NEW.order_number, 'status', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_order_status ON public.orders;
CREATE TRIGGER trg_notify_on_order_status
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_order_status();

-- 6. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;