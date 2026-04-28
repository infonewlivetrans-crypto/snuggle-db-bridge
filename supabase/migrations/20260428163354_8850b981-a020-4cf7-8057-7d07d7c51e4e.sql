-- 1) Новый статус заказа
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'ready_for_delivery';

-- 2) Тип статуса оплаты
DO $$ BEGIN
  CREATE TYPE public.payment_status AS ENUM ('not_paid','partial','paid','refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Новые поля в orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS amount_due NUMERIC,
  ADD COLUMN IF NOT EXISTS payment_status public.payment_status NOT NULL DEFAULT 'not_paid',
  ADD COLUMN IF NOT EXISTS marketplace TEXT,
  ADD COLUMN IF NOT EXISTS client_works_weekends BOOLEAN NOT NULL DEFAULT false;

-- 4) Таблица истории изменений
CREATE TABLE IF NOT EXISTS public.order_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by TEXT,
  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  comment TEXT
);

CREATE INDEX IF NOT EXISTS idx_order_history_order ON public.order_history(order_id, changed_at DESC);

ALTER TABLE public.order_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Anyone can view order_history" ON public.order_history FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Anyone can insert order_history" ON public.order_history FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Anyone can update order_history" ON public.order_history FOR UPDATE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Anyone can delete order_history" ON public.order_history FOR DELETE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5) Триггер автозаписи истории по ключевым полям
CREATE OR REPLACE FUNCTION public.trg_orders_log_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user TEXT := COALESCE(current_setting('app.current_user', true), 'system');
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.order_history(order_id, changed_by, field, old_value, new_value)
    VALUES (NEW.id, v_user, 'created', NULL, NEW.order_number);
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.order_history(order_id, changed_by, field, old_value, new_value)
    VALUES (NEW.id, v_user, 'status', OLD.status::text, NEW.status::text);
  END IF;
  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    INSERT INTO public.order_history(order_id, changed_by, field, old_value, new_value)
    VALUES (NEW.id, v_user, 'payment_status', OLD.payment_status::text, NEW.payment_status::text);
  END IF;
  IF NEW.payment_type IS DISTINCT FROM OLD.payment_type THEN
    INSERT INTO public.order_history(order_id, changed_by, field, old_value, new_value)
    VALUES (NEW.id, v_user, 'payment_type', OLD.payment_type::text, NEW.payment_type::text);
  END IF;
  IF NEW.amount_due IS DISTINCT FROM OLD.amount_due THEN
    INSERT INTO public.order_history(order_id, changed_by, field, old_value, new_value)
    VALUES (NEW.id, v_user, 'amount_due', OLD.amount_due::text, NEW.amount_due::text);
  END IF;
  IF NEW.delivery_cost IS DISTINCT FROM OLD.delivery_cost THEN
    INSERT INTO public.order_history(order_id, changed_by, field, old_value, new_value)
    VALUES (NEW.id, v_user, 'delivery_cost', OLD.delivery_cost::text, NEW.delivery_cost::text);
  END IF;
  IF NEW.cash_received IS DISTINCT FROM OLD.cash_received THEN
    INSERT INTO public.order_history(order_id, changed_by, field, old_value, new_value)
    VALUES (NEW.id, v_user, 'cash_received', OLD.cash_received::text, NEW.cash_received::text);
  END IF;
  IF NEW.qr_received IS DISTINCT FROM OLD.qr_received THEN
    INSERT INTO public.order_history(order_id, changed_by, field, old_value, new_value)
    VALUES (NEW.id, v_user, 'qr_received', OLD.qr_received::text, NEW.qr_received::text);
  END IF;
  IF NEW.delivery_address IS DISTINCT FROM OLD.delivery_address THEN
    INSERT INTO public.order_history(order_id, changed_by, field, old_value, new_value)
    VALUES (NEW.id, v_user, 'delivery_address', OLD.delivery_address, NEW.delivery_address);
  END IF;
  IF NEW.marketplace IS DISTINCT FROM OLD.marketplace THEN
    INSERT INTO public.order_history(order_id, changed_by, field, old_value, new_value)
    VALUES (NEW.id, v_user, 'marketplace', OLD.marketplace, NEW.marketplace);
  END IF;
  IF NEW.client_works_weekends IS DISTINCT FROM OLD.client_works_weekends THEN
    INSERT INTO public.order_history(order_id, changed_by, field, old_value, new_value)
    VALUES (NEW.id, v_user, 'client_works_weekends', OLD.client_works_weekends::text, NEW.client_works_weekends::text);
  END IF;
  IF NEW.requires_qr IS DISTINCT FROM OLD.requires_qr THEN
    INSERT INTO public.order_history(order_id, changed_by, field, old_value, new_value)
    VALUES (NEW.id, v_user, 'requires_qr', OLD.requires_qr::text, NEW.requires_qr::text);
  END IF;
  IF NEW.comment IS DISTINCT FROM OLD.comment THEN
    INSERT INTO public.order_history(order_id, changed_by, field, old_value, new_value)
    VALUES (NEW.id, v_user, 'comment', OLD.comment, NEW.comment);
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS orders_log_history_ins ON public.orders;
CREATE TRIGGER orders_log_history_ins
AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.trg_orders_log_history();

DROP TRIGGER IF EXISTS orders_log_history_upd ON public.orders;
CREATE TRIGGER orders_log_history_upd
AFTER UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.trg_orders_log_history();