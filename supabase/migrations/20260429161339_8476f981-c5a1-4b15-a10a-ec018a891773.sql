-- Stabilize supply request acceptance from warehouse inbound without disabling triggers.
-- This only fixes existing supply/warehouse linkage, statuses, stock movement idempotency and supply notifications.

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

  IF NEW.status <> 'accepted' OR (TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM 'accepted') THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_req
    FROM public.supply_requests
   WHERE id = NEW.supply_request_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(COALESCE(qty_received, qty_expected, 0)), 0)
    INTO v_total_qty
    FROM public.inbound_shipment_items
   WHERE shipment_id = NEW.id;

  IF v_total_qty IS NULL OR v_total_qty <= 0 THEN
    v_total_qty := COALESCE(v_req.qty, 0);
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.stock_movements
     WHERE ref_supply_id = v_req.id
       AND movement_type = 'inbound'
  ) INTO v_has_move;

  IF NOT v_has_move AND v_total_qty > 0 THEN
    INSERT INTO public.stock_movements (
      movement_type,
      product_id,
      warehouse_id,
      qty,
      reason,
      ref_supply_id,
      comment,
      created_by
    ) VALUES (
      'inbound',
      v_req.product_id,
      v_req.destination_warehouse_id,
      v_total_qty,
      'supply_request',
      v_req.id,
      'Поступление по заявке ' || v_req.request_number || ' (приём товара)',
      COALESCE(NEW.accepted_by, v_req.created_by)
    );
  END IF;

  IF v_req.in_transit_id IS NOT NULL THEN
    UPDATE public.supply_in_transit
       SET status = 'received',
           updated_at = now()
     WHERE id = v_req.in_transit_id;
  END IF;

  UPDATE public.supply_requests
     SET supply_status = 'received',
         supply_status_changed_at = now(),
         status = CASE
           WHEN status = 'cancelled' THEN status
           ELSE 'received'::public.supply_request_status
         END,
         received_at = COALESCE(received_at, now()),
         inbound_shipment_id = COALESCE(inbound_shipment_id, NEW.id),
         updated_at = now()
   WHERE id = v_req.id;

  RETURN NEW;
END;
$function$;

-- Make the legacy supply status trigger idempotent so the inbound acceptance update
-- can safely set status='received' without creating a duplicate stock movement.
CREATE OR REPLACE FUNCTION public.trg_supply_requests_sync_in_transit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_in_transit_id UUID;
  v_snapshot JSONB;
  v_has_move BOOLEAN;
BEGIN
  IF (TG_OP = 'UPDATE') AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    IF OLD.status = 'cancelled' THEN
      RAISE EXCEPTION 'Нельзя изменить статус отменённой заявки. Создайте новую.'
        USING ERRCODE = 'P0001';
    END IF;
    IF OLD.status = 'received' AND NEW.status = 'cancelled' THEN
      RAISE EXCEPTION 'Нельзя отменить принятую заявку.'
        USING ERRCODE = 'P0001';
    END IF;

    IF NEW.status IN ('confirmed','in_transit') AND NEW.in_transit_id IS NULL THEN
      INSERT INTO public.supply_in_transit (
        source_type, source_warehouse_id, source_name,
        destination_warehouse_id, product_id, qty,
        expected_at, status, comment
      ) VALUES (
        NEW.source_type::text, NEW.source_warehouse_id, NEW.source_name,
        NEW.destination_warehouse_id, NEW.product_id, NEW.qty,
        NEW.expected_at, 'in_transit',
        COALESCE(NEW.comment, 'Заявка ' || NEW.request_number)
      ) RETURNING id INTO v_in_transit_id;
      NEW.in_transit_id := v_in_transit_id;
      IF NEW.confirmed_at IS NULL THEN NEW.confirmed_at := now(); END IF;
    END IF;

    IF NEW.status = 'received' THEN
      IF NEW.in_transit_id IS NOT NULL THEN
        UPDATE public.supply_in_transit
           SET status = 'received', updated_at = now()
         WHERE id = NEW.in_transit_id;
      END IF;

      SELECT EXISTS (
        SELECT 1
          FROM public.stock_movements
         WHERE ref_supply_id = NEW.id
           AND movement_type = 'inbound'
      ) INTO v_has_move;

      IF NOT v_has_move THEN
        INSERT INTO public.stock_movements (
          movement_type, product_id, warehouse_id, qty, reason, ref_supply_id, comment, created_by
        ) VALUES (
          'inbound', NEW.product_id, NEW.destination_warehouse_id, NEW.qty,
          'supply_request', NEW.id,
          'Поступление по заявке ' || NEW.request_number, NEW.created_by
        );
      END IF;

      IF NEW.received_at IS NULL THEN NEW.received_at := now(); END IF;
      NEW.supply_status := 'received';
      NEW.supply_status_changed_at := COALESCE(NEW.supply_status_changed_at, now());
    END IF;

    IF NEW.status = 'cancelled' THEN
      IF NEW.in_transit_id IS NOT NULL THEN
        SELECT to_jsonb(t) INTO v_snapshot
        FROM (
          SELECT id, source_type, source_warehouse_id, source_name,
                 destination_warehouse_id, product_id, qty, expected_at,
                 status, comment, created_at
          FROM public.supply_in_transit WHERE id = NEW.in_transit_id
        ) t;
        DELETE FROM public.supply_in_transit WHERE id = NEW.in_transit_id;
        PERFORM set_config('app.cancelled_in_transit_snapshot', COALESCE(v_snapshot::text, ''), true);
        NEW.in_transit_id := NULL;
      ELSE
        PERFORM set_config('app.cancelled_in_transit_snapshot', '', true);
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Keep low-stock notifications visible in the Supply cabinet and avoid repeated spam
-- for the same product/warehouse/level while the deficit remains.
CREATE OR REPLACE FUNCTION public.notify_low_stock_for_product(p_product_id uuid, p_warehouse_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_row record;
  v_exists boolean;
BEGIN
  SELECT * INTO v_row FROM public.stock_balances
   WHERE product_id = p_product_id
     AND (warehouse_id = p_warehouse_id OR (warehouse_id IS NULL AND p_warehouse_id IS NULL))
   LIMIT 1;

  IF v_row IS NULL THEN RETURN; END IF;
  IF COALESCE(v_row.min_stock, 0) <= 0 THEN RETURN; END IF;

  IF v_row.deficit_level IN ('out','critical','low') THEN
    SELECT EXISTS (
      SELECT 1
        FROM public.notifications n
       WHERE n.kind = 'supply_alert'
         AND n.payload->>'reason' = 'low_stock'
         AND n.payload->>'product_id' = v_row.product_id::text
         AND COALESCE(n.payload->>'warehouse_id','') = COALESCE(v_row.warehouse_id::text,'')
         AND n.payload->>'level' = v_row.deficit_level::text
    ) INTO v_exists;

    IF v_exists THEN RETURN; END IF;

    INSERT INTO public.notifications (kind, title, body, payload)
    VALUES (
      'supply_alert',
      CASE v_row.deficit_level
        WHEN 'out' THEN 'Товар закончился: ' || v_row.product_name
        WHEN 'critical' THEN 'Критический остаток: ' || v_row.product_name
        ELSE 'Низкий остаток: ' || v_row.product_name
      END,
      COALESCE(v_row.warehouse_name,'—') || ': доступно ' || v_row.available || ' ' || COALESCE(v_row.unit,'шт') ||
        ', минимальный остаток ' || v_row.min_stock || ' ' || COALESCE(v_row.unit,'шт') || '.',
      jsonb_build_object(
        'reason', 'low_stock',
        'recipients', jsonb_build_array('supply'),
        'product_id', v_row.product_id,
        'product_name', v_row.product_name,
        'warehouse_id', v_row.warehouse_id,
        'warehouse_name', v_row.warehouse_name,
        'available', v_row.available,
        'min_stock', v_row.min_stock,
        'level', v_row.deficit_level,
        'occurred_at', now()
      )
    );
  END IF;
END;
$function$;

-- Deficit list should not show products with no configured minimum stock.
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
    WHEN COALESCE(s.min_stock,0) <= 0 THEN 'ok'
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