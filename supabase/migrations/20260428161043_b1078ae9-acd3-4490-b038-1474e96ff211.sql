-- Enums (повтор безопасен)
DO $$ BEGIN
  CREATE TYPE public.tariff_kind AS ENUM (
    'fixed_city','fixed_zone','fixed_direction','per_km_round','per_km_last','per_point','combo','percent_goods','manual'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.delivery_cost_source AS ENUM ('auto','manual','tariff');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tariffs
CREATE TABLE IF NOT EXISTS public.delivery_tariffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID NOT NULL,
  name TEXT NOT NULL,
  kind public.tariff_kind NOT NULL,
  city TEXT NULL,
  zone TEXT NULL,
  destination_city TEXT NULL,
  locality TEXT NULL,
  radius_km NUMERIC NULL,
  fixed_price NUMERIC NULL,
  price_per_km NUMERIC NULL,
  price_per_point NUMERIC NULL,
  base_price NUMERIC NULL,
  goods_percent NUMERIC NULL,
  min_price NUMERIC NULL,
  valid_from DATE NULL,
  valid_to DATE NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 100,
  comment TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.delivery_tariffs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Anyone can view delivery_tariffs" ON public.delivery_tariffs FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Anyone can insert delivery_tariffs" ON public.delivery_tariffs FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Anyone can update delivery_tariffs" ON public.delivery_tariffs FOR UPDATE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Anyone can delete delivery_tariffs" ON public.delivery_tariffs FOR DELETE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_delivery_tariffs_wh_active ON public.delivery_tariffs(warehouse_id, is_active);

DROP TRIGGER IF EXISTS delivery_tariffs_updated_at ON public.delivery_tariffs;
CREATE TRIGGER delivery_tariffs_updated_at BEFORE UPDATE ON public.delivery_tariffs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Routes / Orders fields
ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS total_distance_km NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_cost NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS carrier_cost NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_cost BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_cost NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_cost_source public.delivery_cost_source NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS delivery_zone TEXT NULL,
  ADD COLUMN IF NOT EXISTS destination_city TEXT NULL,
  ADD COLUMN IF NOT EXISTS goods_amount NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS applied_tariff_id UUID NULL;

-- Подбор тарифа
CREATE OR REPLACE FUNCTION public.pick_delivery_tariff(
  p_warehouse_id UUID,
  p_order_city TEXT,
  p_order_zone TEXT,
  p_warehouse_city TEXT
)
RETURNS public.delivery_tariffs
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_row public.delivery_tariffs;
BEGIN
  SELECT * INTO v_row FROM public.delivery_tariffs t
   WHERE t.warehouse_id = p_warehouse_id
     AND t.is_active = true
     AND (t.valid_from IS NULL OR t.valid_from <= v_today)
     AND (t.valid_to   IS NULL OR t.valid_to   >= v_today)
     AND (
       (t.kind = 'fixed_direction'
         AND p_warehouse_city IS NOT NULL AND p_order_city IS NOT NULL
         AND lower(coalesce(t.city,'')) = lower(p_warehouse_city)
         AND lower(coalesce(t.destination_city,'')) = lower(p_order_city))
       OR (t.kind = 'fixed_zone' AND p_order_zone IS NOT NULL
           AND lower(coalesce(t.zone,'')) = lower(p_order_zone))
       OR (t.kind = 'fixed_city' AND p_order_city IS NOT NULL
           AND lower(coalesce(t.city,'')) = lower(p_order_city))
       OR (t.kind IN ('per_km_round','per_km_last','per_point','combo','percent_goods','manual'))
     )
   ORDER BY
     CASE t.kind
       WHEN 'fixed_direction' THEN 1
       WHEN 'fixed_zone'      THEN 2
       WHEN 'fixed_city'      THEN 3
       ELSE 4
     END,
     t.priority ASC,
     t.created_at DESC
   LIMIT 1;
  RETURN v_row;
END $$;

-- Расчёт стоимости заказа (searched CASE)
CREATE OR REPLACE FUNCTION public.calc_order_delivery_cost(p_order_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order        public.orders;
  v_route        public.routes;
  v_warehouse    public.warehouses;
  v_tariff       public.delivery_tariffs;
  v_points_count INTEGER := 0;
  v_distance_km  NUMERIC := 0;
  v_cost         NUMERIC := 0;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  IF v_order.delivery_cost_source = 'manual' THEN
    RETURN v_order.delivery_cost;
  END IF;

  SELECT r.* INTO v_route
  FROM public.route_points rp
  JOIN public.routes r ON r.id = rp.route_id
  WHERE rp.order_id = p_order_id
  ORDER BY rp.created_at DESC
  LIMIT 1;

  IF v_route.id IS NULL THEN
    UPDATE public.orders
       SET delivery_cost = 0, delivery_cost_source = 'auto', applied_tariff_id = NULL
     WHERE id = p_order_id;
    RETURN 0;
  END IF;

  v_points_count := COALESCE(v_route.points_count, 0);
  v_distance_km  := COALESCE(v_route.total_distance_km, 0);

  SELECT * INTO v_warehouse FROM public.warehouses WHERE id = v_route.warehouse_id;

  v_tariff := public.pick_delivery_tariff(
    v_route.warehouse_id,
    COALESCE(v_order.destination_city, NULL),
    COALESCE(v_order.delivery_zone, NULL),
    v_warehouse.city
  );

  IF v_tariff.id IS NULL THEN
    UPDATE public.orders
       SET delivery_cost = 0, delivery_cost_source = 'auto', applied_tariff_id = NULL
     WHERE id = p_order_id;
    RETURN 0;
  END IF;

  v_cost := CASE
    WHEN v_tariff.kind IN ('fixed_city','fixed_zone','fixed_direction','manual')
      THEN COALESCE(v_tariff.fixed_price, 0)
    WHEN v_tariff.kind IN ('per_km_round','per_km_last')
      THEN COALESCE(v_tariff.price_per_km,0) * v_distance_km / NULLIF(v_points_count,0)
    WHEN v_tariff.kind = 'per_point'
      THEN COALESCE(v_tariff.price_per_point, 0)
    WHEN v_tariff.kind = 'combo'
      THEN COALESCE(v_tariff.base_price,0)
         + COALESCE(v_tariff.price_per_km,0) * v_distance_km / NULLIF(v_points_count,0)
         + COALESCE(v_tariff.price_per_point,0)
    WHEN v_tariff.kind = 'percent_goods'
      THEN COALESCE(v_tariff.goods_percent,0) * COALESCE(v_order.goods_amount,0) / 100.0
    ELSE 0
  END;

  v_cost := COALESCE(v_cost, 0);
  IF v_tariff.min_price IS NOT NULL AND v_cost < v_tariff.min_price THEN
    v_cost := v_tariff.min_price;
  END IF;
  v_cost := round(v_cost::numeric, 2);

  UPDATE public.orders
     SET delivery_cost = v_cost,
         delivery_cost_source = 'tariff',
         applied_tariff_id = v_tariff.id
   WHERE id = p_order_id;

  RETURN v_cost;
END $$;

CREATE OR REPLACE FUNCTION public.recalc_route_costs(p_route_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sum NUMERIC := 0;
  r_order_id UUID;
BEGIN
  FOR r_order_id IN
    SELECT order_id FROM public.route_points WHERE route_id = p_route_id
  LOOP
    PERFORM public.calc_order_delivery_cost(r_order_id);
  END LOOP;

  SELECT COALESCE(SUM(o.delivery_cost), 0) INTO v_sum
  FROM public.route_points rp
  JOIN public.orders o ON o.id = rp.order_id
  WHERE rp.route_id = p_route_id;

  UPDATE public.routes
     SET delivery_cost = v_sum,
         updated_at = now()
   WHERE id = p_route_id AND manual_cost = false;
END $$;

-- Триггеры
CREATE OR REPLACE FUNCTION public.trg_route_points_recalc_costs()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalc_route_costs(OLD.route_id);
    RETURN OLD;
  END IF;
  PERFORM public.recalc_route_costs(NEW.route_id);
  IF TG_OP = 'UPDATE' AND NEW.route_id IS DISTINCT FROM OLD.route_id THEN
    PERFORM public.recalc_route_costs(OLD.route_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS route_points_recalc_costs ON public.route_points;
CREATE TRIGGER route_points_recalc_costs
AFTER INSERT OR UPDATE OR DELETE ON public.route_points
FOR EACH ROW EXECUTE FUNCTION public.trg_route_points_recalc_costs();

CREATE OR REPLACE FUNCTION public.trg_routes_recalc_costs()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF (NEW.total_distance_km IS DISTINCT FROM OLD.total_distance_km
      OR NEW.warehouse_id    IS DISTINCT FROM OLD.warehouse_id
      OR NEW.points_count    IS DISTINCT FROM OLD.points_count
      OR NEW.manual_cost     IS DISTINCT FROM OLD.manual_cost) THEN
    PERFORM public.recalc_route_costs(NEW.id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS routes_recalc_costs ON public.routes;
CREATE TRIGGER routes_recalc_costs
AFTER UPDATE ON public.routes
FOR EACH ROW EXECUTE FUNCTION public.trg_routes_recalc_costs();

CREATE OR REPLACE FUNCTION public.trg_tariff_recalc_warehouse()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r_id UUID;
BEGIN
  FOR r_id IN
    SELECT id FROM public.routes
     WHERE warehouse_id = COALESCE(NEW.warehouse_id, OLD.warehouse_id)
       AND status NOT IN ('completed','cancelled')
  LOOP
    PERFORM public.recalc_route_costs(r_id);
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS delivery_tariffs_recalc ON public.delivery_tariffs;
CREATE TRIGGER delivery_tariffs_recalc
AFTER INSERT OR UPDATE OR DELETE ON public.delivery_tariffs
FOR EACH ROW EXECUTE FUNCTION public.trg_tariff_recalc_warehouse();