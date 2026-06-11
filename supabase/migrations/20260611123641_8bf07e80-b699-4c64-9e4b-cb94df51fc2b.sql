
ALTER TABLE public.dispatcher_deals
  ADD COLUMN IF NOT EXISTS dispatcher_user_id uuid NULL,
  ADD COLUMN IF NOT EXISTS dispatcher_commission_percent numeric NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS dispatcher_commission_amount numeric NULL,
  ADD COLUMN IF NOT EXISTS platform_commission_amount numeric NULL,
  ADD COLUMN IF NOT EXISTS dispatcher_payout_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS dispatcher_payout_due_date date NULL,
  ADD COLUMN IF NOT EXISTS dispatcher_paid_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS dispatcher_payout_comment text NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dispatcher_deals_dispatcher_payout_status_chk'
  ) THEN
    ALTER TABLE public.dispatcher_deals
      ADD CONSTRAINT dispatcher_deals_dispatcher_payout_status_chk
      CHECK (dispatcher_payout_status IN ('pending','ready','paid','held','cancelled'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS dispatcher_deals_dispatcher_user_id_idx
  ON public.dispatcher_deals (dispatcher_user_id);
CREATE INDEX IF NOT EXISTS dispatcher_deals_dispatcher_payout_status_idx
  ON public.dispatcher_deals (dispatcher_payout_status);

-- Trigger: recompute split unless already paid; sync payout_status with commission_status.
CREATE OR REPLACE FUNCTION public.dispatcher_deals_calc_dispatcher_commission()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  pct numeric;
  commission numeric;
BEGIN
  -- Default percent
  IF NEW.dispatcher_commission_percent IS NULL THEN
    NEW.dispatcher_commission_percent := 50;
  END IF;

  pct := NEW.dispatcher_commission_percent;
  commission := COALESCE(NEW.commission_amount, 0);

  -- Recalculate split only while not paid.
  IF NEW.dispatcher_payout_status IS DISTINCT FROM 'paid' THEN
    NEW.dispatcher_commission_amount :=
      ROUND((commission * pct / 100.0)::numeric, 2);
    NEW.platform_commission_amount :=
      ROUND((commission - NEW.dispatcher_commission_amount)::numeric, 2);
  END IF;

  -- When commission is received and we still have a pending payout — move to ready.
  IF NEW.commission_status IN ('commission_paid','received')
     AND NEW.dispatcher_payout_status = 'pending' THEN
    NEW.dispatcher_payout_status := 'ready';
    IF NEW.dispatcher_payout_due_date IS NULL THEN
      NEW.dispatcher_payout_due_date := CURRENT_DATE;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dispatcher_deals_calc_dispatcher_commission ON public.dispatcher_deals;
CREATE TRIGGER trg_dispatcher_deals_calc_dispatcher_commission
BEFORE INSERT OR UPDATE OF commission_amount, dispatcher_commission_percent, commission_status, dispatcher_payout_status
ON public.dispatcher_deals
FOR EACH ROW EXECUTE FUNCTION public.dispatcher_deals_calc_dispatcher_commission();

-- Backfill existing rows.
UPDATE public.dispatcher_deals
SET
  dispatcher_user_id = COALESCE(dispatcher_user_id, created_by),
  dispatcher_commission_percent = COALESCE(dispatcher_commission_percent, 50),
  dispatcher_commission_amount = ROUND((COALESCE(commission_amount,0) * COALESCE(dispatcher_commission_percent, 50) / 100.0)::numeric, 2),
  platform_commission_amount = ROUND((COALESCE(commission_amount,0) - (COALESCE(commission_amount,0) * COALESCE(dispatcher_commission_percent, 50) / 100.0))::numeric, 2),
  dispatcher_payout_status = CASE
    WHEN dispatcher_payout_status = 'paid' THEN 'paid'
    WHEN commission_status IN ('commission_paid','received') THEN 'ready'
    ELSE 'pending'
  END
WHERE TRUE;
