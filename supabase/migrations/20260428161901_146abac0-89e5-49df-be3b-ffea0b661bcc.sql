-- Поля аудита ручной стоимости
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS manual_cost_reason TEXT,
  ADD COLUMN IF NOT EXISTS manual_cost_set_by TEXT,
  ADD COLUMN IF NOT EXISTS manual_cost_set_at TIMESTAMPTZ;

-- Триггер: на смену источника стоимости / ручной правке
CREATE OR REPLACE FUNCTION public.trg_orders_manual_cost_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Переключение в ручной режим
  IF NEW.delivery_cost_source = 'manual' AND (
       OLD.delivery_cost_source IS DISTINCT FROM 'manual'
       OR NEW.delivery_cost IS DISTINCT FROM OLD.delivery_cost
       OR NEW.manual_cost_reason IS DISTINCT FROM OLD.manual_cost_reason
     ) THEN
    -- Требуем причину
    IF NEW.manual_cost_reason IS NULL OR length(trim(NEW.manual_cost_reason)) = 0 THEN
      RAISE EXCEPTION 'Для ручного изменения стоимости доставки требуется указать причину'
        USING ERRCODE = 'P0001';
    END IF;
    NEW.manual_cost_set_at := now();
    -- manual_cost_set_by должен быть проставлен клиентом; если нет — оставляем как было
    IF NEW.manual_cost_set_by IS NULL OR length(trim(NEW.manual_cost_set_by)) = 0 THEN
      NEW.manual_cost_set_by := COALESCE(OLD.manual_cost_set_by, 'unknown');
    END IF;
    NEW.applied_tariff_id := NULL;
  END IF;

  -- Возврат к автоматическому режиму
  IF OLD.delivery_cost_source = 'manual' AND NEW.delivery_cost_source IN ('auto','tariff') THEN
    NEW.manual_cost_reason := NULL;
    NEW.manual_cost_set_by := NULL;
    NEW.manual_cost_set_at := NULL;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS orders_manual_cost_audit ON public.orders;
CREATE TRIGGER orders_manual_cost_audit
BEFORE UPDATE OF delivery_cost, delivery_cost_source, manual_cost_reason
ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.trg_orders_manual_cost_audit();

-- Триггер AFTER: при возврате к auto/tariff — пересчитать
CREATE OR REPLACE FUNCTION public.trg_orders_recalc_after_manual_off()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.delivery_cost_source = 'manual'
     AND NEW.delivery_cost_source IN ('auto','tariff') THEN
    PERFORM public.calc_order_delivery_cost(NEW.id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS orders_recalc_after_manual_off ON public.orders;
CREATE TRIGGER orders_recalc_after_manual_off
AFTER UPDATE OF delivery_cost_source
ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.trg_orders_recalc_after_manual_off();