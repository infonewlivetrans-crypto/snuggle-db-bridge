
ALTER TABLE public.dispatcher_vehicle_ext
  ADD COLUMN IF NOT EXISTS location_source text,
  ADD COLUMN IF NOT EXISTS ready_radius_km integer,
  ADD COLUMN IF NOT EXISTS ready_mode text,
  ADD COLUMN IF NOT EXISTS ready_weekdays integer[],
  ADD COLUMN IF NOT EXISTS ready_from date;

ALTER TABLE public.dispatcher_vehicle_ext
  DROP CONSTRAINT IF EXISTS dispatcher_vehicle_location_source_chk;
ALTER TABLE public.dispatcher_vehicle_ext
  ADD CONSTRAINT dispatcher_vehicle_location_source_chk
  CHECK (location_source IS NULL OR location_source IN ('gps','driver','carrier','admin','home_city','manual'));

ALTER TABLE public.dispatcher_vehicle_ext
  DROP CONSTRAINT IF EXISTS dispatcher_vehicle_ready_mode_chk;
ALTER TABLE public.dispatcher_vehicle_ext
  ADD CONSTRAINT dispatcher_vehicle_ready_mode_chk
  CHECK (ready_mode IS NULL OR ready_mode IN ('today','from_date','always','weekdays','custom'));

ALTER TABLE public.dispatcher_vehicle_ext
  DROP CONSTRAINT IF EXISTS dispatcher_vehicle_ready_radius_chk;
ALTER TABLE public.dispatcher_vehicle_ext
  ADD CONSTRAINT dispatcher_vehicle_ready_radius_chk
  CHECK (ready_radius_km IS NULL OR (ready_radius_km >= 0 AND ready_radius_km <= 999));
