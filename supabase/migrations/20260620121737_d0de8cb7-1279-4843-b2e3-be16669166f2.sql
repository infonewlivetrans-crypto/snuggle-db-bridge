
-- Add new fields to edo_counterparties for Stage 1: counterparty registry
ALTER TABLE public.edo_counterparties
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS edo_operator text,
  ADD COLUMN IF NOT EXISTS participant_id text,
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS last_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- Backfill company_name from existing name field where empty
UPDATE public.edo_counterparties
   SET company_name = name
 WHERE company_name IS NULL;

-- Constrain verification_status to known values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'edo_counterparties_verification_status_chk'
  ) THEN
    ALTER TABLE public.edo_counterparties
      ADD CONSTRAINT edo_counterparties_verification_status_chk
      CHECK (verification_status IN ('unknown','verified','not_found','error'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS edo_counterparties_inn_idx
  ON public.edo_counterparties (inn);
CREATE INDEX IF NOT EXISTS edo_counterparties_company_name_idx
  ON public.edo_counterparties (company_name);
CREATE INDEX IF NOT EXISTS edo_counterparties_verification_status_idx
  ON public.edo_counterparties (verification_status);
CREATE INDEX IF NOT EXISTS edo_counterparties_archived_at_idx
  ON public.edo_counterparties (archived_at);
