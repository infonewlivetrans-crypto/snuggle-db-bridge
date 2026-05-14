-- Enum для статусов точки в рамках маршрута доставки
DO $$ BEGIN
  CREATE TYPE public.delivery_point_status AS ENUM (
    'waiting','en_route','arrived','unloading','delivered','not_delivered','returned_to_warehouse'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Enum для причин недоставки
DO $$ BEGIN
  CREATE TYPE public.delivery_point_undelivered_reason AS ENUM (
    'client_absent','client_no_answer','no_payment','no_qr','client_refused','no_unloading','defective','other'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Поля в route_points (аддитивно, не трогаем существующий status)
ALTER TABLE public.route_points
  ADD COLUMN IF NOT EXISTS dp_status public.delivery_point_status NOT NULL DEFAULT 'waiting',
  ADD COLUMN IF NOT EXISTS dp_undelivered_reason public.delivery_point_undelivered_reason,
  ADD COLUMN IF NOT EXISTS dp_return_warehouse_id uuid,
  ADD COLUMN IF NOT EXISTS dp_return_comment text,
  ADD COLUMN IF NOT EXISTS dp_expected_return_at timestamptz,
  ADD COLUMN IF NOT EXISTS dp_status_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS dp_status_changed_by text;
