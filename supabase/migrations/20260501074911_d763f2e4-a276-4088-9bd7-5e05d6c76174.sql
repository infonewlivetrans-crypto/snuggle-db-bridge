CREATE TYPE public.carrier_payout_status AS ENUM (
  'to_pay', 'scheduled', 'paid', 'partially_paid', 'cancelled'
);

ALTER TABLE public.routes
  ADD COLUMN carrier_payout_status public.carrier_payout_status,
  ADD COLUMN carrier_payout_scheduled_date date,
  ADD COLUMN carrier_payout_paid_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN carrier_payout_paid_at timestamptz,
  ADD COLUMN carrier_payout_comment text,
  ADD COLUMN carrier_payout_changed_at timestamptz,
  ADD COLUMN carrier_payout_changed_by uuid;

CREATE INDEX idx_routes_payout_status ON public.routes(carrier_payout_status);
CREATE INDEX idx_routes_payout_scheduled_date ON public.routes(carrier_payout_scheduled_date);

-- Auto-init payout status when payment becomes "to_pay"
CREATE OR REPLACE FUNCTION public.trg_routes_payout_init()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.carrier_payment_status = 'to_pay'::carrier_payment_status
     AND COALESCE(OLD.carrier_payment_status::text,'') <> 'to_pay'
     AND NEW.carrier_payout_status IS NULL THEN
    NEW.carrier_payout_status := 'to_pay'::carrier_payout_status;
    NEW.carrier_payout_changed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_routes_payout_init ON public.routes;
CREATE TRIGGER trg_routes_payout_init
  BEFORE UPDATE OF carrier_payment_status ON public.routes
  FOR EACH ROW EXECUTE FUNCTION public.trg_routes_payout_init();

-- Backfill: routes already in to_pay state
UPDATE public.routes
   SET carrier_payout_status = 'to_pay'::carrier_payout_status,
       carrier_payout_changed_at = COALESCE(carrier_payout_changed_at, now())
 WHERE carrier_payment_status = 'to_pay'::carrier_payment_status
   AND carrier_payout_status IS NULL;

-- Extend history actions
ALTER TABLE public.route_carrier_history
  DROP CONSTRAINT IF EXISTS route_carrier_history_action_check;

ALTER TABLE public.route_carrier_history
  ADD CONSTRAINT route_carrier_history_action_check
  CHECK (action IN (
    'offer_sent','accepted_by_carrier','declined_by_carrier',
    'confirmed_by_logist','rejected_by_logist','released',
    'documents_uploaded','documents_accepted','documents_rejected',
    'marked_to_pay','payment_scheduled','payment_paid','payment_partial','payment_cancelled'
  ));