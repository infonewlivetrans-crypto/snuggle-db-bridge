-- 1. История статусов
CREATE TABLE IF NOT EXISTS public.supply_request_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supply_request_id UUID NOT NULL,
  from_status public.supply_request_status NULL,
  to_status public.supply_request_status NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by TEXT NULL,
  comment TEXT NULL,
  in_transit_snapshot JSONB NULL
);

ALTER TABLE public.supply_request_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view supply_request_status_history" ON public.supply_request_status_history FOR SELECT USING (true);
CREATE POLICY "Anyone can insert supply_request_status_history" ON public.supply_request_status_history FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update supply_request_status_history" ON public.supply_request_status_history FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete supply_request_status_history" ON public.supply_request_status_history FOR DELETE USING (true);

CREATE INDEX IF NOT EXISTS idx_supply_history_request ON public.supply_request_status_history(supply_request_id, changed_at DESC);

-- 2. Триггер записи истории.
-- AFTER UPDATE — чтобы supply_in_transit, удалённый в BEFORE-триггере, был доступен через прежний OLD.in_transit_id (он уже удалён, поэтому делаем снимок ДО удаления).
-- Решение: пишем историю в AFTER UPDATE, а снимок берём из supply_in_transit по OLD.in_transit_id если запись ещё есть, иначе — из самих полей OLD.
-- Для надёжной фиксации при отмене перехватываем удаление supply_in_transit отдельным триггером, который кладёт снимок в temp поле.
-- Простое решение: BEFORE-триггер sync_in_transit перед удалением сохраняет снимок в session var, AFTER-триггер истории его читает.

CREATE OR REPLACE FUNCTION public.trg_supply_requests_sync_in_transit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_in_transit_id UUID;
  v_snapshot JSONB;
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

    -- Отмена: снимок + удаление
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
        -- Сохраняем снимок в session-переменной для AFTER-триггера истории
        PERFORM set_config('app.cancelled_in_transit_snapshot', COALESCE(v_snapshot::text, ''), true);
        NEW.in_transit_id := NULL;
      ELSE
        PERFORM set_config('app.cancelled_in_transit_snapshot', '', true);
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- 3. AFTER-триггер: запись истории
CREATE OR REPLACE FUNCTION public.trg_supply_requests_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_snapshot JSONB := NULL;
  v_snap_text TEXT;
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.supply_request_status_history
      (supply_request_id, from_status, to_status, changed_at, changed_by, comment)
    VALUES (NEW.id, NULL, NEW.status, now(), NEW.created_by, 'Заявка создана');
    RETURN NEW;
  END IF;

  IF (TG_OP = 'UPDATE') AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    IF NEW.status = 'cancelled' THEN
      v_snap_text := current_setting('app.cancelled_in_transit_snapshot', true);
      IF v_snap_text IS NOT NULL AND length(v_snap_text) > 0 THEN
        v_snapshot := v_snap_text::jsonb;
      END IF;
    END IF;
    INSERT INTO public.supply_request_status_history
      (supply_request_id, from_status, to_status, changed_at, changed_by, comment, in_transit_snapshot)
    VALUES (NEW.id, OLD.status, NEW.status, now(), NEW.created_by, NULL, v_snapshot);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS supply_requests_history_insert ON public.supply_requests;
CREATE TRIGGER supply_requests_history_insert
AFTER INSERT ON public.supply_requests
FOR EACH ROW EXECUTE FUNCTION public.trg_supply_requests_history();

DROP TRIGGER IF EXISTS supply_requests_history_update ON public.supply_requests;
CREATE TRIGGER supply_requests_history_update
AFTER UPDATE ON public.supply_requests
FOR EACH ROW EXECUTE FUNCTION public.trg_supply_requests_history();