-- Тип статуса расчёта с перевозчиком
DO $$ BEGIN
  CREATE TYPE public.carrier_payment_status AS ENUM
    ('not_calculated','calculated','review','approved','to_pay');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS carrier_payment_status public.carrier_payment_status
    NOT NULL DEFAULT 'not_calculated',
  ADD COLUMN IF NOT EXISTS carrier_cost_comment text,
  ADD COLUMN IF NOT EXISTS carrier_cost_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS carrier_cost_approved_by uuid;

-- Автоматический переход 'not_calculated' → 'calculated' при появлении суммы
CREATE OR REPLACE FUNCTION public.trg_routes_carrier_payment_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.carrier_cost IS DISTINCT FROM OLD.carrier_cost THEN
    IF COALESCE(NEW.carrier_cost,0) > 0
       AND NEW.carrier_payment_status = 'not_calculated' THEN
      NEW.carrier_payment_status := 'calculated';
    END IF;
    -- Сброс подтверждения при изменении суммы
    IF NEW.carrier_payment_status IN ('approved','to_pay')
       AND NEW.carrier_cost IS DISTINCT FROM OLD.carrier_cost THEN
      NEW.carrier_payment_status := 'review';
      NEW.carrier_cost_approved_at := NULL;
      NEW.carrier_cost_approved_by := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_routes_carrier_payment_status ON public.routes;
CREATE TRIGGER trg_routes_carrier_payment_status
  BEFORE UPDATE OF carrier_cost ON public.routes
  FOR EACH ROW EXECUTE FUNCTION public.trg_routes_carrier_payment_status();

-- Перевозчик видит расчёт по своим рейсам
DROP POLICY IF EXISTS routes_carrier_select_own ON public.routes;
CREATE POLICY routes_carrier_select_own ON public.routes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.carrier_id IS NOT NULL
        AND p.carrier_id = routes.carrier_id
    )
  );