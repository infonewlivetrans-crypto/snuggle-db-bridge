CREATE OR REPLACE FUNCTION public.trg_supply_requests_sync_in_transit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_in_transit_id UUID;
BEGIN
  IF (TG_OP = 'UPDATE') AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    -- Запрет: из отменённого никуда нельзя
    IF OLD.status = 'cancelled' THEN
      RAISE EXCEPTION 'Нельзя изменить статус отменённой заявки. Создайте новую.'
        USING ERRCODE = 'P0001';
    END IF;
    -- Запрет: принятую заявку отменять нельзя (товар уже оприходован)
    IF OLD.status = 'received' AND NEW.status = 'cancelled' THEN
      RAISE EXCEPTION 'Нельзя отменить принятую заявку.'
        USING ERRCODE = 'P0001';
    END IF;

    -- Confirmed / in_transit -> создаём запись «в пути»
    IF NEW.status IN ('confirmed','in_transit') AND NEW.in_transit_id IS NULL THEN
      INSERT INTO public.supply_in_transit (
        source_type, source_warehouse_id, source_name,
        destination_warehouse_id, product_id, qty,
        expected_at, status, comment
      ) VALUES (
        NEW.source_type::text,
        NEW.source_warehouse_id,
        NEW.source_name,
        NEW.destination_warehouse_id,
        NEW.product_id,
        NEW.qty,
        NEW.expected_at,
        'in_transit',
        COALESCE(NEW.comment, 'Заявка ' || NEW.request_number)
      ) RETURNING id INTO v_in_transit_id;
      NEW.in_transit_id := v_in_transit_id;
      IF NEW.confirmed_at IS NULL THEN NEW.confirmed_at := now(); END IF;
    END IF;

    -- Принято -> снять с «в пути», создать движение inbound
    IF NEW.status = 'received' THEN
      IF NEW.in_transit_id IS NOT NULL THEN
        UPDATE public.supply_in_transit SET status = 'received', updated_at = now()
         WHERE id = NEW.in_transit_id;
      END IF;
      INSERT INTO public.stock_movements (
        movement_type, product_id, warehouse_id, qty, reason, ref_supply_id, comment, created_by
      ) VALUES (
        'inbound', NEW.product_id, NEW.destination_warehouse_id, NEW.qty,
        'supply_request', NEW.id,
        'Поступление по заявке ' || NEW.request_number, NEW.created_by
      );
      IF NEW.received_at IS NULL THEN NEW.received_at := now(); END IF;
    END IF;

    -- Отменено -> УДАЛИТЬ запись «в пути», движений товара НЕ создаём
    IF NEW.status = 'cancelled' THEN
      IF NEW.in_transit_id IS NOT NULL THEN
        DELETE FROM public.supply_in_transit WHERE id = NEW.in_transit_id;
        NEW.in_transit_id := NULL;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;