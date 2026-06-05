
-- 1) Drop FKs to production tables
ALTER TABLE public.dispatcher_deals
  DROP CONSTRAINT IF EXISTS dispatcher_deals_carrier_id_fkey,
  DROP CONSTRAINT IF EXISTS dispatcher_deals_driver_id_fkey,
  DROP CONSTRAINT IF EXISTS dispatcher_deals_vehicle_id_fkey;

-- 2) Re-link to dispatcher ext tables
ALTER TABLE public.dispatcher_deals
  ADD CONSTRAINT dispatcher_deals_carrier_ext_fkey
    FOREIGN KEY (carrier_id) REFERENCES public.dispatcher_carrier_ext(id) ON DELETE SET NULL,
  ADD CONSTRAINT dispatcher_deals_driver_ext_fkey
    FOREIGN KEY (driver_id) REFERENCES public.dispatcher_driver_ext(id) ON DELETE SET NULL,
  ADD CONSTRAINT dispatcher_deals_vehicle_ext_fkey
    FOREIGN KEY (vehicle_id) REFERENCES public.dispatcher_vehicle_ext(id) ON DELETE SET NULL;

-- 3) Add new columns
ALTER TABLE public.dispatcher_deals
  ADD COLUMN IF NOT EXISTS deal_number text UNIQUE,
  ADD COLUMN IF NOT EXISTS route_from text,
  ADD COLUMN IF NOT EXISTS route_to text,
  ADD COLUMN IF NOT EXISTS loading_date date,
  ADD COLUMN IF NOT EXISTS unloading_date date,
  ADD COLUMN IF NOT EXISTS payment_type text,
  ADD COLUMN IF NOT EXISTS payment_delay_days integer,
  ADD COLUMN IF NOT EXISTS expected_payment_date date,
  ADD COLUMN IF NOT EXISTS carrier_payment_received_at date,
  ADD COLUMN IF NOT EXISTS commission_paid_at date,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'waiting_customer_payment';

-- 4) Replace CHECK constraints with broader sets matching the canonical statuses
ALTER TABLE public.dispatcher_deals
  DROP CONSTRAINT IF EXISTS dispatcher_deal_status_chk,
  DROP CONSTRAINT IF EXISTS dispatcher_commission_status_chk;

ALTER TABLE public.dispatcher_deals
  ADD CONSTRAINT dispatcher_deal_status_chk CHECK (deal_status IN (
    'draft','offered','agreed','documents_sent','loading','in_transit',
    'unloading','delivered','waiting_payment','closed','cancelled','problem','archived'
  )),
  ADD CONSTRAINT dispatcher_payment_status_chk CHECK (payment_status IN (
    'not_expected','waiting_customer_payment','customer_paid_carrier','overdue','dispute','closed'
  )),
  ADD CONSTRAINT dispatcher_commission_status_chk CHECK (commission_status IN (
    'not_accrued','accrued','waiting_customer_payment','waiting_commission','commission_paid','overdue','dispute','closed'
  ));

-- 5) Deal number sequence + trigger
CREATE SEQUENCE IF NOT EXISTS public.dispatcher_deals_number_seq;

CREATE OR REPLACE FUNCTION public.dispatcher_deals_set_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.deal_number IS NULL OR NEW.deal_number = '' THEN
    NEW.deal_number := 'D-' || to_char(now(), 'YYMM') || '-' || lpad(nextval('public.dispatcher_deals_number_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dispatcher_deals_set_number ON public.dispatcher_deals;
CREATE TRIGGER trg_dispatcher_deals_set_number
  BEFORE INSERT ON public.dispatcher_deals
  FOR EACH ROW EXECUTE FUNCTION public.dispatcher_deals_set_number();

-- 6) updated_at trigger (reuse existing helper if any; create safely)
CREATE OR REPLACE FUNCTION public.dispatcher_deals_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dispatcher_deals_touch ON public.dispatcher_deals;
CREATE TRIGGER trg_dispatcher_deals_touch
  BEFORE UPDATE ON public.dispatcher_deals
  FOR EACH ROW EXECUTE FUNCTION public.dispatcher_deals_touch_updated_at();

-- 7) Indices for filters
CREATE INDEX IF NOT EXISTS idx_dispatcher_deals_status ON public.dispatcher_deals(deal_status);
CREATE INDEX IF NOT EXISTS idx_dispatcher_deals_payment ON public.dispatcher_deals(payment_status);
CREATE INDEX IF NOT EXISTS idx_dispatcher_deals_commission ON public.dispatcher_deals(commission_status);
CREATE INDEX IF NOT EXISTS idx_dispatcher_deals_carrier ON public.dispatcher_deals(carrier_id);
CREATE INDEX IF NOT EXISTS idx_dispatcher_deals_driver ON public.dispatcher_deals(driver_id);
CREATE INDEX IF NOT EXISTS idx_dispatcher_deals_vehicle ON public.dispatcher_deals(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_dispatcher_deals_freight ON public.dispatcher_deals(main_freight_id);

-- 8) Backfill default deal_number for existing rows
UPDATE public.dispatcher_deals
SET deal_number = 'D-' || to_char(created_at, 'YYMM') || '-' || lpad(nextval('public.dispatcher_deals_number_seq')::text, 5, '0')
WHERE deal_number IS NULL OR deal_number = '';
