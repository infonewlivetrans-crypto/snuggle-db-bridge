DROP VIEW IF EXISTS public.stock_balances;
CREATE VIEW public.stock_balances
WITH (security_invoker = true)
AS
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
