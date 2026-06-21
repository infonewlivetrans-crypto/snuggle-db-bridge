
ALTER TABLE public.edo_counterparties
  ADD COLUMN IF NOT EXISTS contact_person text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'both';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'edo_counterparties_role_chk'
  ) THEN
    ALTER TABLE public.edo_counterparties
      ADD CONSTRAINT edo_counterparties_role_chk
      CHECK (role IN ('shipper','consignee','both'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS edo_counterparties_role_idx
  ON public.edo_counterparties (role);
