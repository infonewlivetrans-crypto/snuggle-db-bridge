-- Тип клиента
DO $$ BEGIN
  CREATE TYPE public.client_kind AS ENUM (
    'individual',
    'organization',
    'shop',
    'factory',
    'snt',
    'dacha'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_window_from time without time zone,
  ADD COLUMN IF NOT EXISTS delivery_window_to   time without time zone,
  ADD COLUMN IF NOT EXISTS client_type          public.client_kind,
  ADD COLUMN IF NOT EXISTS delivery_time_comment text;