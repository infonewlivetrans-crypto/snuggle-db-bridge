-- 1) Таблица истории действий водителя по точке маршрута
CREATE TABLE IF NOT EXISTS public.route_point_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  route_point_id UUID NOT NULL,
  order_id UUID,
  route_id UUID,
  action TEXT NOT NULL,
  actor TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rpa_route_point ON public.route_point_actions (route_point_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rpa_order ON public.route_point_actions (order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rpa_route ON public.route_point_actions (route_id, created_at DESC);

ALTER TABLE public.route_point_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view route_point_actions"
  ON public.route_point_actions FOR SELECT USING (true);
CREATE POLICY "Anyone can insert route_point_actions"
  ON public.route_point_actions FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update route_point_actions"
  ON public.route_point_actions FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete route_point_actions"
  ON public.route_point_actions FOR DELETE USING (true);

-- 2) Авто-логирование изменений на route_points
CREATE OR REPLACE FUNCTION public.log_route_point_actions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor TEXT := COALESCE(NEW.dp_status_changed_by, current_setting('app.current_user', true));
BEGIN
  -- Изменение финального статуса точки
  IF TG_OP = 'UPDATE' AND NEW.dp_status IS DISTINCT FROM OLD.dp_status THEN
    INSERT INTO public.route_point_actions (route_point_id, order_id, route_id, action, actor, details, comment)
    VALUES (
      NEW.id, NEW.order_id, NEW.route_id,
      CASE NEW.dp_status::text
        WHEN 'delivered' THEN 'status_delivered'
        WHEN 'not_delivered' THEN 'status_not_delivered'
        WHEN 'returned_to_warehouse' THEN 'status_returned'
        ELSE 'status_changed'
      END,
      v_actor,
      jsonb_build_object(
        'from', OLD.dp_status,
        'to', NEW.dp_status,
        'reason', NEW.dp_undelivered_reason
      ),
      CASE NEW.dp_status::text
        WHEN 'returned_to_warehouse' THEN NEW.dp_return_comment
        ELSE NEW.dp_payment_comment
      END
    );
  END IF;

  -- Указание суммы оплаты
  IF TG_OP = 'UPDATE' AND NEW.dp_amount_received IS DISTINCT FROM OLD.dp_amount_received
     AND NEW.dp_amount_received IS NOT NULL THEN
    INSERT INTO public.route_point_actions (route_point_id, order_id, route_id, action, actor, details)
    VALUES (
      NEW.id, NEW.order_id, NEW.route_id,
      'payment_amount_set', v_actor,
      jsonb_build_object('amount_received', NEW.dp_amount_received)
    );
  END IF;

  -- Комментарий по оплате/доставке
  IF TG_OP = 'UPDATE' AND COALESCE(NEW.dp_payment_comment,'') IS DISTINCT FROM COALESCE(OLD.dp_payment_comment,'')
     AND NEW.dp_payment_comment IS NOT NULL AND length(trim(NEW.dp_payment_comment)) > 0 THEN
    INSERT INTO public.route_point_actions (route_point_id, order_id, route_id, action, actor, comment)
    VALUES (NEW.id, NEW.order_id, NEW.route_id, 'comment_added', v_actor, NEW.dp_payment_comment);
  END IF;

  -- Комментарий по возврату
  IF TG_OP = 'UPDATE' AND COALESCE(NEW.dp_return_comment,'') IS DISTINCT FROM COALESCE(OLD.dp_return_comment,'')
     AND NEW.dp_return_comment IS NOT NULL AND length(trim(NEW.dp_return_comment)) > 0 THEN
    INSERT INTO public.route_point_actions (route_point_id, order_id, route_id, action, actor, comment)
    VALUES (NEW.id, NEW.order_id, NEW.route_id, 'return_comment_added', v_actor, NEW.dp_return_comment);
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_route_points_log_actions ON public.route_points;
CREATE TRIGGER trg_route_points_log_actions
AFTER UPDATE ON public.route_points
FOR EACH ROW EXECUTE FUNCTION public.log_route_point_actions();

-- 3) Авто-логирование загрузки фото точки
CREATE OR REPLACE FUNCTION public.log_route_point_photo_action()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_route_id UUID;
BEGIN
  SELECT route_id INTO v_route_id FROM public.route_points WHERE id = NEW.route_point_id;
  INSERT INTO public.route_point_actions (route_point_id, order_id, route_id, action, actor, details)
  VALUES (
    NEW.route_point_id, NEW.order_id, v_route_id,
    CASE NEW.kind::text
      WHEN 'qr' THEN 'photo_qr_uploaded'
      WHEN 'documents' THEN 'photo_documents_uploaded'
      WHEN 'problem' THEN 'photo_problem_uploaded'
      ELSE 'photo_uploaded'
    END,
    NEW.uploaded_by,
    jsonb_build_object('kind', NEW.kind, 'file_url', NEW.file_url)
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_route_point_photos_log_action ON public.route_point_photos;
CREATE TRIGGER trg_route_point_photos_log_action
AFTER INSERT ON public.route_point_photos
FOR EACH ROW EXECUTE FUNCTION public.log_route_point_photo_action();

-- 4) Логирование загрузки QR на заказе (привязываем к последней точке маршрута, если есть)
CREATE OR REPLACE FUNCTION public.log_order_qr_photo_action()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_point_id UUID;
  v_route_id UUID;
BEGIN
  IF (OLD.qr_photo_url IS NULL OR OLD.qr_photo_url = '')
     AND NEW.qr_photo_url IS NOT NULL AND NEW.qr_photo_url <> '' THEN
    SELECT rp.id, rp.route_id INTO v_point_id, v_route_id
      FROM public.route_points rp
     WHERE rp.order_id = NEW.id
     ORDER BY rp.created_at DESC LIMIT 1;
    IF v_point_id IS NOT NULL THEN
      INSERT INTO public.route_point_actions (route_point_id, order_id, route_id, action, actor, details)
      VALUES (
        v_point_id, NEW.id, v_route_id,
        'photo_qr_uploaded',
        NEW.qr_photo_uploaded_by,
        jsonb_build_object('file_url', NEW.qr_photo_url, 'source', 'order')
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_orders_log_qr_photo_action ON public.orders;
CREATE TRIGGER trg_orders_log_qr_photo_action
AFTER UPDATE OF qr_photo_url ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.log_order_qr_photo_action();