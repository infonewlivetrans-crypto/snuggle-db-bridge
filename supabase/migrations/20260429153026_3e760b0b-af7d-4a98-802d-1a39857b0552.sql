-- 1. Функция применения движения к stock_qty
CREATE OR REPLACE FUNCTION public.apply_stock_movement_to_product()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delta NUMERIC := 0;
BEGIN
  -- Только эти типы движений меняют физический остаток на складе.
  -- Резервы (reserve / reservation_release / reservation_consume) учитываются
  -- отдельно через таблицу stock_reservations и в physical on-hand не входят.
  IF NEW.movement_type IN (
    'inbound', 'shipment', 'outbound', 'adjustment',
    'transfer_in', 'transfer_out', 'return_in', 'return_out'
  ) THEN
    v_delta := COALESCE(NEW.qty, 0);
    IF v_delta <> 0 THEN
      UPDATE public.products
         SET stock_qty = COALESCE(stock_qty, 0) + v_delta,
             updated_at = now()
       WHERE id = NEW.product_id
         AND (warehouse_id = NEW.warehouse_id OR warehouse_id IS NULL);
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_stock_movements_apply ON public.stock_movements;
CREATE TRIGGER trg_stock_movements_apply
AFTER INSERT ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.apply_stock_movement_to_product();

-- 2. Одноразовая пересборка stock_qty по существующим движениям.
-- Берём базу = текущий products.stock_qty МИНУС сумма уже зачтённых движений
-- (которых не было до триггера — значит они ещё не отражены).
-- Чтобы не сделать двойной учёт: если движений нет — оставляем как есть.
WITH agg AS (
  SELECT product_id, warehouse_id,
         SUM(qty) FILTER (
           WHERE movement_type IN (
             'inbound','shipment','outbound','adjustment',
             'transfer_in','transfer_out','return_in','return_out'
           )
         ) AS delta
    FROM public.stock_movements
   GROUP BY product_id, warehouse_id
)
UPDATE public.products p
   SET stock_qty = COALESCE(p.stock_qty, 0) + COALESCE(a.delta, 0),
       updated_at = now()
  FROM agg a
 WHERE a.product_id = p.id
   AND (a.warehouse_id = p.warehouse_id OR p.warehouse_id IS NULL)
   AND COALESCE(a.delta, 0) <> 0;
