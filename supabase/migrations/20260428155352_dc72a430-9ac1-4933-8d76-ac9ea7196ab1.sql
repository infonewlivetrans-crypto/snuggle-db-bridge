-- 1) Минимальный/страховой запас на товаре по складу
CREATE TABLE public.product_stock_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  warehouse_id uuid,
  min_stock numeric NOT NULL DEFAULT 0,
  safety_stock numeric NOT NULL DEFAULT 0,
  is_critical boolean NOT NULL DEFAULT false,
  on_demand_only boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, warehouse_id)
);
ALTER TABLE public.product_stock_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view product_stock_settings" ON public.product_stock_settings FOR SELECT USING (true);
CREATE POLICY "Anyone can insert product_stock_settings" ON public.product_stock_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update product_stock_settings" ON public.product_stock_settings FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete product_stock_settings" ON public.product_stock_settings FOR DELETE USING (true);
CREATE TRIGGER trg_pss_updated_at BEFORE UPDATE ON public.product_stock_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Движения склада (приход/расход/корректировка)
CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  movement_type text NOT NULL CHECK (movement_type IN ('inbound','outbound','adjustment','reservation_release')),
  qty numeric NOT NULL,
  reason text,
  ref_order_id uuid,
  ref_route_id uuid,
  ref_supply_id uuid,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text
);
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view stock_movements" ON public.stock_movements FOR SELECT USING (true);
CREATE POLICY "Anyone can insert stock_movements" ON public.stock_movements FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update stock_movements" ON public.stock_movements FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete stock_movements" ON public.stock_movements FOR DELETE USING (true);
CREATE INDEX idx_stock_mov_prod_wh ON public.stock_movements(product_id, warehouse_id);

-- 3) Резервы под заказы (текущая позиция, без истории)
CREATE TABLE public.stock_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  order_id uuid,
  qty numeric NOT NULL CHECK (qty >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','released','consumed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.stock_reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view stock_reservations" ON public.stock_reservations FOR SELECT USING (true);
CREATE POLICY "Anyone can insert stock_reservations" ON public.stock_reservations FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update stock_reservations" ON public.stock_reservations FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete stock_reservations" ON public.stock_reservations FOR DELETE USING (true);
CREATE INDEX idx_reserv_prod_wh ON public.stock_reservations(product_id, warehouse_id);
CREATE TRIGGER trg_reserv_updated_at BEFORE UPDATE ON public.stock_reservations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Поставки/перемещения «в пути»
CREATE TABLE public.supply_in_transit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  destination_warehouse_id uuid NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('factory','warehouse','supplier')),
  source_warehouse_id uuid,
  source_name text,
  qty numeric NOT NULL CHECK (qty > 0),
  expected_at timestamptz,
  status text NOT NULL DEFAULT 'in_transit' CHECK (status IN ('planned','in_transit','arrived','cancelled')),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.supply_in_transit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view supply_in_transit" ON public.supply_in_transit FOR SELECT USING (true);
CREATE POLICY "Anyone can insert supply_in_transit" ON public.supply_in_transit FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update supply_in_transit" ON public.supply_in_transit FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete supply_in_transit" ON public.supply_in_transit FOR DELETE USING (true);
CREATE INDEX idx_transit_dest ON public.supply_in_transit(destination_warehouse_id, status);
CREATE TRIGGER trg_transit_updated_at BEFORE UPDATE ON public.supply_in_transit FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) Представление: рассчитанные остатки по товару/складу
CREATE OR REPLACE VIEW public.stock_balances AS
SELECT
  p.id  AS product_id,
  p.sku,
  p.name AS product_name,
  p.unit,
  w.id  AS warehouse_id,
  w.name AS warehouse_name,
  COALESCE(p.stock_qty, 0) AS on_hand,
  COALESCE(r.reserved, 0)  AS reserved,
  GREATEST(COALESCE(p.stock_qty,0) - COALESCE(r.reserved,0), 0) AS available,
  COALESCE(t.in_transit, 0) AS in_transit,
  COALESCE(s.min_stock, 0) AS min_stock,
  COALESCE(s.safety_stock, 0) AS safety_stock,
  COALESCE(s.is_critical, false) AS is_critical,
  CASE
    WHEN COALESCE(p.stock_qty,0) - COALESCE(r.reserved,0) <= 0 THEN 'out'
    WHEN COALESCE(p.stock_qty,0) - COALESCE(r.reserved,0) <= COALESCE(s.min_stock,0) THEN 'critical'
    WHEN COALESCE(p.stock_qty,0) - COALESCE(r.reserved,0) <= COALESCE(s.min_stock,0) + COALESCE(s.safety_stock,0) THEN 'low'
    ELSE 'ok'
  END AS deficit_level
FROM public.products p
LEFT JOIN public.warehouses w ON w.id = p.warehouse_id
LEFT JOIN (
  SELECT product_id, warehouse_id, SUM(qty) AS reserved
  FROM public.stock_reservations
  WHERE status = 'active'
  GROUP BY product_id, warehouse_id
) r ON r.product_id = p.id AND r.warehouse_id = p.warehouse_id
LEFT JOIN (
  SELECT product_id, destination_warehouse_id AS warehouse_id, SUM(qty) AS in_transit
  FROM public.supply_in_transit
  WHERE status IN ('planned','in_transit')
  GROUP BY product_id, destination_warehouse_id
) t ON t.product_id = p.id AND t.warehouse_id = p.warehouse_id
LEFT JOIN public.product_stock_settings s
  ON s.product_id = p.id AND (s.warehouse_id = p.warehouse_id OR s.warehouse_id IS NULL);

-- 6) Уведомление при низком остатке (после изменения резерва или прихода)
CREATE OR REPLACE FUNCTION public.notify_low_stock_for_product(p_product_id uuid, p_warehouse_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
BEGIN
  SELECT * INTO v_row FROM public.stock_balances
   WHERE product_id = p_product_id
     AND (warehouse_id = p_warehouse_id OR (warehouse_id IS NULL AND p_warehouse_id IS NULL))
   LIMIT 1;
  IF v_row IS NULL THEN RETURN; END IF;
  IF v_row.deficit_level IN ('out','critical','low') THEN
    INSERT INTO public.notifications (kind, title, body, payload)
    VALUES (
      'low_stock',
      CASE v_row.deficit_level
        WHEN 'out' THEN 'Товар закончился'
        WHEN 'critical' THEN 'Критический остаток'
        ELSE 'Низкий остаток'
      END,
      COALESCE(v_row.warehouse_name,'—') || ': ' || v_row.product_name ||
        ' — доступно ' || v_row.available || ' ' || COALESCE(v_row.unit,'шт') ||
        ' (мин. ' || v_row.min_stock || ')',
      jsonb_build_object(
        'product_id', v_row.product_id,
        'warehouse_id', v_row.warehouse_id,
        'available', v_row.available,
        'min_stock', v_row.min_stock,
        'level', v_row.deficit_level
      )
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_low_stock_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public.notify_low_stock_for_product(
    COALESCE(NEW.product_id, OLD.product_id),
    COALESCE(NEW.warehouse_id, OLD.warehouse_id)
  );
  RETURN NEW;
END $$;

CREATE TRIGGER trg_reserv_low_stock
AFTER INSERT OR UPDATE OR DELETE ON public.stock_reservations
FOR EACH ROW EXECUTE FUNCTION public.trg_low_stock_check();

CREATE TRIGGER trg_movement_low_stock
AFTER INSERT ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.trg_low_stock_check();
