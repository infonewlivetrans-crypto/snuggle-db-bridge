ALTER TABLE public.dispatcher_vehicle_ext
  ADD COLUMN IF NOT EXISTS current_lat numeric,
  ADD COLUMN IF NOT EXISTS current_lng numeric,
  ADD COLUMN IF NOT EXISTS location_updated_at timestamptz;