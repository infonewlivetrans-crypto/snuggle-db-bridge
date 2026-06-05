
-- 1) ADD COLUMN IF NOT EXISTS — все nullable
ALTER TABLE public.dispatcher_freights
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS loading_city text,
  ADD COLUMN IF NOT EXISTS unloading_city text,
  ADD COLUMN IF NOT EXISTS loading_date date,
  ADD COLUMN IF NOT EXISTS unloading_date date,
  ADD COLUMN IF NOT EXISTS cargo_name text,
  ADD COLUMN IF NOT EXISTS load_methods text[],
  ADD COLUMN IF NOT EXISTS payment_type text,
  ADD COLUMN IF NOT EXISTS payment_delay_days integer,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS contact_whatsapp text,
  ADD COLUMN IF NOT EXISTS contact_telegram text,
  ADD COLUMN IF NOT EXISTS contact_max_messenger text,
  ADD COLUMN IF NOT EXISTS dispatcher_status text,
  ADD COLUMN IF NOT EXISTS freight_kind text;

-- 2) Backfill из старых колонок
UPDATE public.dispatcher_freights
SET
  loading_city    = COALESCE(loading_city, from_city),
  unloading_city  = COALESCE(unloading_city, to_city),
  loading_date    = COALESCE(loading_date, load_date),
  unloading_date  = COALESCE(unloading_date, unload_date),
  contact_name    = COALESCE(contact_name, contact),
  payment_type    = COALESCE(payment_type, payment_term),
  load_methods    = COALESCE(load_methods,
                     CASE WHEN loading_method IS NOT NULL AND loading_method <> ''
                          THEN ARRAY[loading_method] ELSE NULL END),
  freight_kind    = COALESCE(freight_kind, CASE WHEN is_addon THEN 'additional' ELSE 'main' END),
  dispatcher_status = COALESCE(dispatcher_status,
                       CASE status
                         WHEN 'match'      THEN 'suitable'
                         WHEN 'no_match'   THEN 'rejected'
                         WHEN 'in_progress' THEN 'checking'
                         WHEN 'taken'      THEN 'booked'
                         WHEN 'archive'    THEN 'archived'
                         WHEN 'new'        THEN 'new'
                         WHEN 'rejected'   THEN 'rejected'
                         ELSE 'new'
                       END);

-- 3) Дефолты + NOT NULL для двух ключевых
ALTER TABLE public.dispatcher_freights
  ALTER COLUMN freight_kind SET DEFAULT 'main',
  ALTER COLUMN dispatcher_status SET DEFAULT 'new';

UPDATE public.dispatcher_freights SET freight_kind = 'main' WHERE freight_kind IS NULL;
UPDATE public.dispatcher_freights SET dispatcher_status = 'new' WHERE dispatcher_status IS NULL;

ALTER TABLE public.dispatcher_freights
  ALTER COLUMN freight_kind SET NOT NULL,
  ALTER COLUMN dispatcher_status SET NOT NULL;

-- 4) Синхронизируем CHECK constraints
ALTER TABLE public.dispatcher_freights
  DROP CONSTRAINT IF EXISTS dispatcher_freight_status_chk;

ALTER TABLE public.dispatcher_freights
  DROP CONSTRAINT IF EXISTS dispatcher_freights_dispatcher_status_chk;

ALTER TABLE public.dispatcher_freights
  ADD CONSTRAINT dispatcher_freights_dispatcher_status_chk
  CHECK (dispatcher_status IN (
    'new','checking','suitable','offered','booked','rejected','cancelled','archived'
  ));

ALTER TABLE public.dispatcher_freights
  DROP CONSTRAINT IF EXISTS dispatcher_freights_freight_kind_chk;

ALTER TABLE public.dispatcher_freights
  ADD CONSTRAINT dispatcher_freights_freight_kind_chk
  CHECK (freight_kind IN ('main','additional'));

-- 5) Индексы для частых фильтров
CREATE INDEX IF NOT EXISTS dispatcher_freights_loading_city_idx
  ON public.dispatcher_freights (loading_city);
CREATE INDEX IF NOT EXISTS dispatcher_freights_unloading_city_idx
  ON public.dispatcher_freights (unloading_city);
CREATE INDEX IF NOT EXISTS dispatcher_freights_loading_date_idx
  ON public.dispatcher_freights (loading_date);
CREATE INDEX IF NOT EXISTS dispatcher_freights_dispatcher_status_idx
  ON public.dispatcher_freights (dispatcher_status);
