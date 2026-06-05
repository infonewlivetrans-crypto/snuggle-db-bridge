
-- ===================== dispatcher_carrier_ext =====================
ALTER TABLE public.dispatcher_carrier_ext
  DROP CONSTRAINT IF EXISTS dispatcher_carrier_ext_pkey;

ALTER TABLE public.dispatcher_carrier_ext
  ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();

ALTER TABLE public.dispatcher_carrier_ext
  ALTER COLUMN carrier_id DROP NOT NULL;

ALTER TABLE public.dispatcher_carrier_ext
  ADD COLUMN IF NOT EXISTS name              text,
  ADD COLUMN IF NOT EXISTS carrier_kind      text,
  ADD COLUMN IF NOT EXISTS inn               text,
  ADD COLUMN IF NOT EXISTS ogrn              text,
  ADD COLUMN IF NOT EXISTS phone             text,
  ADD COLUMN IF NOT EXISTS email             text,
  ADD COLUMN IF NOT EXISTS city              text,
  ADD COLUMN IF NOT EXISTS whatsapp          text,
  ADD COLUMN IF NOT EXISTS telegram          text,
  ADD COLUMN IF NOT EXISTS max_messenger     text,
  ADD COLUMN IF NOT EXISTS bank_name         text,
  ADD COLUMN IF NOT EXISTS bank_account      text,
  ADD COLUMN IF NOT EXISTS bank_bik          text,
  ADD COLUMN IF NOT EXISTS bank_corr_account text,
  ADD COLUMN IF NOT EXISTS commission_rate   numeric NOT NULL DEFAULT 0.05,
  ADD COLUMN IF NOT EXISTS production_carrier_id uuid;

-- ===================== dispatcher_driver_ext =====================
ALTER TABLE public.dispatcher_driver_ext
  DROP CONSTRAINT IF EXISTS dispatcher_driver_ext_pkey;

ALTER TABLE public.dispatcher_driver_ext
  ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();

ALTER TABLE public.dispatcher_driver_ext
  ALTER COLUMN driver_id DROP NOT NULL;

ALTER TABLE public.dispatcher_driver_ext
  ADD COLUMN IF NOT EXISTS full_name        text,
  ADD COLUMN IF NOT EXISTS phone            text,
  ADD COLUMN IF NOT EXISTS email            text,
  ADD COLUMN IF NOT EXISTS whatsapp         text,
  ADD COLUMN IF NOT EXISTS telegram         text,
  ADD COLUMN IF NOT EXISTS max_messenger    text,
  ADD COLUMN IF NOT EXISTS dispatcher_carrier_ext_id uuid,
  ADD COLUMN IF NOT EXISTS docs_verified    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS production_driver_id uuid;

-- ===================== dispatcher_vehicle_ext =====================
ALTER TABLE public.dispatcher_vehicle_ext
  DROP CONSTRAINT IF EXISTS dispatcher_vehicle_ext_pkey;

ALTER TABLE public.dispatcher_vehicle_ext
  ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();

ALTER TABLE public.dispatcher_vehicle_ext
  ALTER COLUMN vehicle_id DROP NOT NULL;

ALTER TABLE public.dispatcher_vehicle_ext
  ADD COLUMN IF NOT EXISTS vehicle_kind     text,
  ADD COLUMN IF NOT EXISTS body_type        text,
  ADD COLUMN IF NOT EXISTS payload_kg       numeric,
  ADD COLUMN IF NOT EXISTS volume_m3        numeric,
  ADD COLUMN IF NOT EXISTS length_m         numeric,
  ADD COLUMN IF NOT EXISTS width_m          numeric,
  ADD COLUMN IF NOT EXISTS height_m         numeric,
  ADD COLUMN IF NOT EXISTS load_methods     text[],
  ADD COLUMN IF NOT EXISTS home_city        text,
  ADD COLUMN IF NOT EXISTS ready_to_cities  text[],
  ADD COLUMN IF NOT EXISTS dispatcher_driver_ext_id  uuid,
  ADD COLUMN IF NOT EXISTS dispatcher_carrier_ext_id uuid,
  ADD COLUMN IF NOT EXISTS production_vehicle_id     uuid,
  ADD COLUMN IF NOT EXISTS minimum_trip_rate numeric,
  ADD COLUMN IF NOT EXISTS minimum_km_rate   numeric,
  ADD COLUMN IF NOT EXISTS city_rate         numeric,
  ADD COLUMN IF NOT EXISTS point_rate        numeric,
  ADD COLUMN IF NOT EXISTS rate_comment      text;

-- ===================== индексы =====================
CREATE INDEX IF NOT EXISTS idx_dispatcher_carrier_ext_status
  ON public.dispatcher_carrier_ext (verification_status);
CREATE INDEX IF NOT EXISTS idx_dispatcher_carrier_ext_city
  ON public.dispatcher_carrier_ext (city);

CREATE INDEX IF NOT EXISTS idx_dispatcher_driver_ext_status
  ON public.dispatcher_driver_ext (dispatcher_status);
CREATE INDEX IF NOT EXISTS idx_dispatcher_driver_ext_city
  ON public.dispatcher_driver_ext (city);
CREATE INDEX IF NOT EXISTS idx_dispatcher_driver_ext_carrier
  ON public.dispatcher_driver_ext (dispatcher_carrier_ext_id);

CREATE INDEX IF NOT EXISTS idx_dispatcher_vehicle_ext_status
  ON public.dispatcher_vehicle_ext (dispatcher_status);
CREATE INDEX IF NOT EXISTS idx_dispatcher_vehicle_ext_home_city
  ON public.dispatcher_vehicle_ext (home_city);
CREATE INDEX IF NOT EXISTS idx_dispatcher_vehicle_ext_ready_date
  ON public.dispatcher_vehicle_ext (ready_date);
CREATE INDEX IF NOT EXISTS idx_dispatcher_vehicle_ext_carrier
  ON public.dispatcher_vehicle_ext (dispatcher_carrier_ext_id);
CREATE INDEX IF NOT EXISTS idx_dispatcher_vehicle_ext_driver
  ON public.dispatcher_vehicle_ext (dispatcher_driver_ext_id);
