CREATE OR REPLACE FUNCTION public.trg_low_stock_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_TABLE_NAME = 'stock_movements' THEN
    RETURN NEW;
  END IF;

  PERFORM public.notify_low_stock_for_product(
    COALESCE(NEW.product_id, OLD.product_id),
    COALESCE(NEW.warehouse_id, OLD.warehouse_id)
  );

  RETURN COALESCE(NEW, OLD);
END;
$function$;