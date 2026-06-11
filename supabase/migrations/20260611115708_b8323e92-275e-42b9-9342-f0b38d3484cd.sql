
ALTER TABLE public.dispatcher_deals
  ADD COLUMN IF NOT EXISTS customer_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS customer_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS loading_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS in_transit_at timestamptz,
  ADD COLUMN IF NOT EXISTS unloading_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS customer_payment_due_date date,
  ADD COLUMN IF NOT EXISTS customer_paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS commission_due_date date,
  ADD COLUMN IF NOT EXISTS commission_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS deal_closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS dispatcher_next_action text;

ALTER TABLE public.dispatcher_deals
  DROP CONSTRAINT IF EXISTS dispatcher_deal_status_chk;

ALTER TABLE public.dispatcher_deals
  ADD CONSTRAINT dispatcher_deal_status_chk CHECK (deal_status IN (
    'draft','offered','agreed','documents_sent',
    'customer_sent','customer_confirmed',
    'loading','in_transit','unloading','delivered',
    'waiting_payment','waiting_customer_payment','waiting_commission','commission_received',
    'closed','cancelled','problem','archived'
  ));
