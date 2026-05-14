CREATE OR REPLACE FUNCTION public.apply_stock_movement_to_product()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_delta NUMERIC := 0;
BEGIN
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

      PERFORM public.notify_low_stock_for_product(NEW.product_id, NEW.warehouse_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;