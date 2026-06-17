-- Carrier ext: ATI / taxation / requisites / onboarding progress
ALTER TABLE public.dispatcher_carrier_ext
  ADD COLUMN IF NOT EXISTS ati_code text,
  ADD COLUMN IF NOT EXISTS ati_email text,
  ADD COLUMN IF NOT EXISTS taxation_type text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS bik text,
  ADD COLUMN IF NOT EXISTS settlement_account text,
  ADD COLUMN IF NOT EXISTS correspondent_account text,
  ADD COLUMN IF NOT EXISTS legal_address text,
  ADD COLUMN IF NOT EXISTS onboarding_step text,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_progress jsonb DEFAULT '{}'::jsonb;

-- Driver ext: user link / contact / license / docs
ALTER TABLE public.dispatcher_driver_ext
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS whatsapp text,
  ADD COLUMN IF NOT EXISTS telegram text,
  ADD COLUMN IF NOT EXISTS max_messenger text,
  ADD COLUMN IF NOT EXISTS license_categories text[],
  ADD COLUMN IF NOT EXISTS license_number text,
  ADD COLUMN IF NOT EXISTS experience_years numeric,
  ADD COLUMN IF NOT EXISTS has_dopog boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_med_book boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS permissions text[],
  ADD COLUMN IF NOT EXISTS docs_comment text,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

-- Vehicle ext: assigned driver (NOT unique), readiness, body features
ALTER TABLE public.dispatcher_vehicle_ext
  ADD COLUMN IF NOT EXISTS assigned_driver_ext_id uuid,
  ADD COLUMN IF NOT EXISTS ready_to_cities text[],
  ADD COLUMN IF NOT EXISTS body_features text[],
  ADD COLUMN IF NOT EXISTS docs_comment text,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

-- Remove unique constraint on assigned_driver_ext_id if exists
DO $$
DECLARE
  c_name text;
BEGIN
  SELECT conname INTO c_name
  FROM pg_constraint
  WHERE conrelid = 'public.dispatcher_vehicle_ext'::regclass
    AND contype = 'u'
    AND pg_get_constraintdef(oid) ILIKE '%assigned_driver_ext_id%';
  IF c_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.dispatcher_vehicle_ext DROP CONSTRAINT %I', c_name);
  END IF;
END $$;

-- Drop any unique index on assigned_driver_ext_id alone
DO $$
DECLARE
  i_name text;
BEGIN
  FOR i_name IN
    SELECT i.relname
    FROM pg_index x
    JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_class t ON t.oid = x.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'dispatcher_vehicle_ext'
      AND x.indisunique AND NOT x.indisprimary
      AND pg_get_indexdef(i.oid) ILIKE '%(assigned_driver_ext_id)%'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', i_name);
  END LOOP;
END $$;

-- Helpful (non-unique) index for lookups
CREATE INDEX IF NOT EXISTS dispatcher_vehicle_ext_assigned_driver_idx
  ON public.dispatcher_vehicle_ext (assigned_driver_ext_id);
CREATE INDEX IF NOT EXISTS dispatcher_driver_ext_user_id_idx
  ON public.dispatcher_driver_ext (user_id);