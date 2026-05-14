-- 1) Менеджеры клиентов: добавить телефон
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS manager_phone TEXT;

-- 2) Срочность проблемы
DO $$ BEGIN
  CREATE TYPE public.problem_urgency AS ENUM ('normal','urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Таблица проблем по заказу (от водителя менеджеру)
CREATE TABLE IF NOT EXISTS public.order_problem_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL,
  route_point_id UUID,
  route_id UUID,
  reason TEXT NOT NULL,
  comment TEXT,
  photo_url TEXT,
  urgency public.problem_urgency NOT NULL DEFAULT 'normal',
  reported_by TEXT,
  manager_name TEXT,
  manager_phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.order_problem_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view order_problem_reports" ON public.order_problem_reports FOR SELECT USING (true);
CREATE POLICY "Anyone can insert order_problem_reports" ON public.order_problem_reports FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update order_problem_reports" ON public.order_problem_reports FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete order_problem_reports" ON public.order_problem_reports FOR DELETE USING (true);

CREATE INDEX IF NOT EXISTS idx_order_problem_reports_order ON public.order_problem_reports(order_id, created_at DESC);

-- 4) Триггер: уведомление менеджеру о проблеме
CREATE OR REPLACE FUNCTION public.notify_on_order_problem_report()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_manager TEXT;
  v_manager_phone TEXT;
  v_route_number TEXT;
BEGIN
  SELECT id, order_number, contact_name INTO v_order FROM public.orders WHERE id = NEW.order_id;
  IF v_order.id IS NULL THEN RETURN NEW; END IF;

  SELECT manager_name, manager_phone INTO v_manager, v_manager_phone
    FROM public.clients WHERE name = v_order.contact_name LIMIT 1;

  IF NEW.route_id IS NOT NULL THEN
    SELECT route_number INTO v_route_number FROM public.routes WHERE id = NEW.route_id;
  END IF;

  -- Заполним поля карточки проблемы (для отчёта)
  NEW.manager_name := COALESCE(NEW.manager_name, v_manager);
  NEW.manager_phone := COALESCE(NEW.manager_phone, v_manager_phone);

  INSERT INTO public.notifications (kind, title, body, order_id, route_id, payload)
  VALUES (
    'driver_problem_reported',
    CASE WHEN NEW.urgency = 'urgent' THEN 'СРОЧНО: проблема по заказу' ELSE 'Проблема по заказу' END,
    'Водитель сообщил о проблеме по заказу №' || v_order.order_number ||
      CASE WHEN NEW.reason IS NOT NULL AND length(trim(NEW.reason))>0 THEN '. Причина: ' || NEW.reason ELSE '' END,
    NEW.order_id,
    NEW.route_id,
    jsonb_build_object(
      'order_number', v_order.order_number,
      'reason', NEW.reason,
      'comment', NEW.comment,
      'photo_url', NEW.photo_url,
      'urgency', NEW.urgency,
      'reported_by', NEW.reported_by,
      'manager_name', v_manager,
      'manager_phone', v_manager_phone,
      'route_id', NEW.route_id,
      'route_number', v_route_number,
      'route_point_id', NEW.route_point_id
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_order_problem_report ON public.order_problem_reports;
CREATE TRIGGER trg_notify_on_order_problem_report
BEFORE INSERT ON public.order_problem_reports
FOR EACH ROW EXECUTE FUNCTION public.notify_on_order_problem_report();