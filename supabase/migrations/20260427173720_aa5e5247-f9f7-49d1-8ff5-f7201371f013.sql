-- ENUM типа заявки на транспорт
DO $$ BEGIN
  CREATE TYPE public.transport_request_type AS ENUM (
    'client_delivery',
    'warehouse_transfer',
    'factory_to_warehouse'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Поля веса/объёма у заказа
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS total_weight_kg NUMERIC,
  ADD COLUMN IF NOT EXISTS total_volume_m3 NUMERIC,
  ADD COLUMN IF NOT EXISTS items_count INTEGER;

-- Поля заявки на маршруте
ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS request_type public.transport_request_type NOT NULL DEFAULT 'client_delivery',
  ADD COLUMN IF NOT EXISTS destination_warehouse_id UUID,
  ADD COLUMN IF NOT EXISTS required_body_type public.body_type,
  ADD COLUMN IF NOT EXISTS required_capacity_kg NUMERIC,
  ADD COLUMN IF NOT EXISTS required_volume_m3 NUMERIC,
  ADD COLUMN IF NOT EXISTS planned_departure_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS total_weight_kg NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_volume_m3 NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS points_count INTEGER NOT NULL DEFAULT 0;

-- Функция пересчёта итогов маршрута
CREATE OR REPLACE FUNCTION public.recalc_route_totals(p_route_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.routes r
     SET total_weight_kg = COALESCE(t.w, 0),
         total_volume_m3 = COALESCE(t.v, 0),
         points_count    = COALESCE(t.c, 0),
         updated_at      = now()
    FROM (
      SELECT
        SUM(COALESCE(o.total_weight_kg, 0)) AS w,
        SUM(COALESCE(o.total_volume_m3, 0)) AS v,
        COUNT(*)                            AS c
      FROM public.route_points rp
      JOIN public.orders o ON o.id = rp.order_id
      WHERE rp.route_id = p_route_id
    ) t
   WHERE r.id = p_route_id;
END;
$$;

-- Триггер на route_points → пересчёт обоих маршрутов (если order переехал)
CREATE OR REPLACE FUNCTION public.trg_route_points_recalc()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalc_route_totals(OLD.route_id);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.route_id IS DISTINCT FROM OLD.route_id THEN
      PERFORM public.recalc_route_totals(OLD.route_id);
    END IF;
    PERFORM public.recalc_route_totals(NEW.route_id);
    RETURN NEW;
  ELSE
    PERFORM public.recalc_route_totals(NEW.route_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS route_points_recalc_totals ON public.route_points;
CREATE TRIGGER route_points_recalc_totals
AFTER INSERT OR UPDATE OR DELETE ON public.route_points
FOR EACH ROW EXECUTE FUNCTION public.trg_route_points_recalc();

-- Триггер на orders → если поменялись вес/объём, пересчитать все связанные маршруты
CREATE OR REPLACE FUNCTION public.trg_orders_recalc_routes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r_id UUID;
BEGIN
  IF NEW.total_weight_kg IS DISTINCT FROM OLD.total_weight_kg
     OR NEW.total_volume_m3 IS DISTINCT FROM OLD.total_volume_m3 THEN
    FOR r_id IN
      SELECT DISTINCT route_id FROM public.route_points WHERE order_id = NEW.id
    LOOP
      PERFORM public.recalc_route_totals(r_id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_recalc_routes ON public.orders;
CREATE TRIGGER orders_recalc_routes
AFTER UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.trg_orders_recalc_routes();

-- Префикс номера маршрута: TR-<тип>-NNNN, оставляем существующую функцию совместимой
-- (старые RT-R-* записи продолжают работать)
