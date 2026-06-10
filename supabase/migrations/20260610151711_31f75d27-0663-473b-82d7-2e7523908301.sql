
ALTER TABLE public.dispatcher_carrier_ext
  ADD COLUMN IF NOT EXISTS tax_regime text,
  ADD COLUMN IF NOT EXISTS ati_id text,
  ADD COLUMN IF NOT EXISTS ati_phone text,
  ADD COLUMN IF NOT EXISTS ati_email text;
