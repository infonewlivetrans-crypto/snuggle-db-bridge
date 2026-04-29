-- Стабилизация связи "Снабжение → Приём на склад":
-- при приёмке inbound_shipment, связанной с заявкой на пополнение,
-- 1) корректно обновляем оба статуса заявки (legacy status и supply_status);
-- 2) гарантированно создаём приходное движение по складу (если ещё не создано),
--    чтобы остаток товара увеличился ровно один раз;
-- 3) закрываем запись supply_in_transit, если она была.

CREATE OR REPLACE FUNCTION public.trg_inbound_accept_supply_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_req       public.supply_requests%ROWTYPE;
  v_has_move  BOOLEAN;
  v_total_qty NUMERIC;
BEGIN
  IF NEW.supply_request_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status <> 'accepted' OR (OLD.status IS NOT DISTINCT FROM 'accepted') THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_req
    FROM public.supply_requests
   WHERE id = NEW.supply_request_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Сколько фактически приняли по позициям (если есть данные), иначе плановое qty заявки
  SELECT COALESCE(SUM(COALESCE(qty_received, qty_expected, 0)), 0)
    INTO v_total_qty
    FROM public.inbound_shipment_items
   WHERE shipment_id = NEW.id;

  IF v_total_qty IS NULL OR v_total_qty <= 0 THEN
    v_total_qty := COALESCE(v_req.qty, 0);
  END IF;

  -- Идемпотентность: не плодим повторных движений по одной и той же заявке
  SELECT EXISTS (
    SELECT 1 FROM public.stock_movements
     WHERE ref_supply_id = v_req.id
       AND movement_type = 'inbound'
  ) INTO v_has_move;

  IF NOT v_has_move AND v_total_qty > 0 AND v_req.destination_warehouse_id IS NOT NULL AND v_req.product_id IS NOT NULL THEN
    INSERT INTO public.stock_movements (
      movement_type, product_id, warehouse_id, qty,
      reason, ref_supply_id, comment, created_by
    ) VALUES (
      'inbound', v_req.product_id, v_req.destination_warehouse_id, v_total_qty,
      'supply_request', v_req.id,
      'Поступление по заявке ' || v_req.request_number || ' (приём на складе)',
      COALESCE(NEW.accepted_by, v_req.created_by)
    );
  END IF;

  -- Закрыть запись "в пути", если есть
  IF v_req.in_transit_id IS NOT NULL THEN
    UPDATE public.supply_in_transit
       SET status = 'received', updated_at = now()
     WHERE id = v_req.in_transit_id;
  END IF;

  -- Обновляем оба статуса заявки. Legacy 'status' меняем напрямую,
  -- минуя триггер sync_in_transit (он ожидает обычный путь и сам создал бы
  -- ещё одно движение — поэтому отключаем его на эту операцию).
  PERFORM set_config('session_replication_role', 'replica', true);
  UPDATE public.supply_requests
     SET supply_status = 'received',
         supply_status_changed_at = now(),
         status = CASE WHEN status IN ('received','cancelled') THEN status ELSE 'received'::supply_request_status END,
         received_at = COALESCE(received_at, now()),
         inbound_shipment_id = COALESCE(inbound_shipment_id, NEW.id),
         updated_at = now()
   WHERE id = v_req.id;
  PERFORM set_config('session_replication_role', 'origin', true);

  RETURN NEW;
END;
$function$;