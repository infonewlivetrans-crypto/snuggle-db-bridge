-- Add supply department workflow fields to supply_requests
ALTER TABLE public.supply_requests
  ADD COLUMN IF NOT EXISTS supply_status text NOT NULL DEFAULT 'created',
  ADD COLUMN IF NOT EXISTS supply_comment text,
  ADD COLUMN IF NOT EXISTS supply_status_changed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS supply_status_changed_by text;

ALTER TABLE public.supply_requests
  DROP CONSTRAINT IF EXISTS supply_requests_supply_status_check;

ALTER TABLE public.supply_requests
  ADD CONSTRAINT supply_requests_supply_status_check
  CHECK (supply_status IN ('created','in_progress','ordered','awaiting','closed'));

CREATE INDEX IF NOT EXISTS idx_supply_requests_supply_status
  ON public.supply_requests(supply_status);