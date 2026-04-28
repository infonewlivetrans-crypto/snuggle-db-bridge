-- Enums
DO $$ BEGIN
  CREATE TYPE public.supply_request_status AS ENUM ('draft','pending','confirmed','in_transit','received','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.supply_request_priority AS ENUM ('low','normal','high','urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.supply_request_source_type AS ENUM ('factory','warehouse');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Main table
CREATE TABLE IF NOT EXISTS public.supply_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number TEXT NOT NULL UNIQUE,
  source_type public.supply_request_source_type NOT NULL,
  source_warehouse_id UUID NULL,
  source_name TEXT NULL,
  destination_warehouse_id UUID NOT NULL,
  product_id UUID NOT NULL,
  qty NUMERIC NOT NULL CHECK (qty > 0),
  priority public.supply_request_priority NOT NULL DEFAULT 'normal',
  status public.supply_request_status NOT NULL DEFAULT 'draft',
  expected_at TIMESTAMPTZ NULL,
  comment TEXT NULL,
  created_by TEXT NULL,
  confirmed_at TIMESTAMPTZ NULL,
  received_at TIMESTAMPTZ NULL,
  in_transit_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.supply_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view supply_requests" ON public.supply_requests FOR SELECT USING (true);
CREATE POLICY "Anyone can insert supply_requests" ON public.supply_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update supply_requests" ON public.supply_requests FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete supply_requests" ON public.supply_requests FOR DELETE USING (true);

-- Auto request number generator
CREATE OR REPLACE FUNCTION public.generate_supply_request_number()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(request_number FROM 'SR-(\d+)') AS INTEGER)), 0) + 1
  INTO next_num
  FROM public.supply_requests
  WHERE request_number ~ '^SR-\d+$';
  RETURN 'SR-' || LPAD(next_num::TEXT, 4, '0');
END;
$$;

-- Trigger: assign number on insert if missing
CREATE OR REPLACE FUNCTION public.trg_supply_requests_set_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.request_number IS NULL OR length(trim(NEW.request_number)) = 0 THEN
    NEW.request_number := public.generate_supply_request_number();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS supply_requests_set_number ON public.supply_requests;
CREATE TRIGGER supply_requests_set_number
BEFORE INSERT ON public.supply_requests
FOR EACH ROW EXECUTE FUNCTION public.trg_supply_requests_set_number();

-- Trigger: updated_at
DROP TRIGGER IF EXISTS supply_requests_updated_at ON public.supply_requests;
CREATE TRIGGER supply_requests_updated_at
BEFORE UPDATE ON public.supply_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger: when status -> confirmed, create in_transit row
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
    -- Move to confirmed/in_transit -> ensure supply_in_transit row
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

    -- Received -> remove in_transit, create stock movement (inbound)
    IF NEW.status = 'received' THEN
      IF NEW.in_transit_id IS NOT NULL THEN
        UPDATE public.supply_in_transit SET status = 'received', updated_at = now() WHERE id = NEW.in_transit_id;
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

    -- Cancelled -> drop in_transit
    IF NEW.status = 'cancelled' AND NEW.in_transit_id IS NOT NULL THEN
      UPDATE public.supply_in_transit SET status = 'cancelled', updated_at = now() WHERE id = NEW.in_transit_id;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS supply_requests_sync_in_transit ON public.supply_requests;
CREATE TRIGGER supply_requests_sync_in_transit
BEFORE UPDATE ON public.supply_requests
FOR EACH ROW EXECUTE FUNCTION public.trg_supply_requests_sync_in_transit();

CREATE INDEX IF NOT EXISTS idx_supply_requests_status ON public.supply_requests(status);
CREATE INDEX IF NOT EXISTS idx_supply_requests_dest ON public.supply_requests(destination_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_supply_requests_product ON public.supply_requests(product_id);