-- Plan-of-supply fields on supply_requests
ALTER TABLE public.supply_requests
  ADD COLUMN IF NOT EXISTS planned_vehicle text,
  ADD COLUMN IF NOT EXISTS planned_carrier text,
  ADD COLUMN IF NOT EXISTS expected_time time without time zone,
  ADD COLUMN IF NOT EXISTS inbound_shipment_id uuid;

-- Allow new supply_status value 'received' (поступило на склад)
ALTER TABLE public.supply_requests
  DROP CONSTRAINT IF EXISTS supply_requests_supply_status_check;

ALTER TABLE public.supply_requests
  ADD CONSTRAINT supply_requests_supply_status_check
  CHECK (supply_status IN ('created','in_progress','ordered','awaiting','received','closed'));

-- Reverse link from inbound_shipments to supply_request
ALTER TABLE public.inbound_shipments
  ADD COLUMN IF NOT EXISTS supply_request_id uuid;

CREATE INDEX IF NOT EXISTS idx_inbound_shipments_supply_request
  ON public.inbound_shipments(supply_request_id);

-- When inbound_shipment status flips to 'accepted', mark linked supply_request received
CREATE OR REPLACE FUNCTION public.trg_inbound_accept_supply_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.supply_request_id IS NOT NULL
     AND NEW.status = 'accepted'
     AND (OLD.status IS DISTINCT FROM 'accepted') THEN
    UPDATE public.supply_requests
       SET supply_status = 'received',
           supply_status_changed_at = now(),
           received_at = COALESCE(received_at, now())
     WHERE id = NEW.supply_request_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inbound_shipments_close_supply_request ON public.inbound_shipments;
CREATE TRIGGER inbound_shipments_close_supply_request
  AFTER UPDATE ON public.inbound_shipments
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_inbound_accept_supply_request();