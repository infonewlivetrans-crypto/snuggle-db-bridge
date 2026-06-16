
-- 1) Fix carrier registration: missing city column on drivers
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS city text;

-- 2) Ensure dispatcher_vehicle_ext has needed columns
ALTER TABLE public.dispatcher_vehicle_ext ADD COLUMN IF NOT EXISTS dispatcher_status text;
ALTER TABLE public.dispatcher_vehicle_ext ADD COLUMN IF NOT EXISTS load_status text;
ALTER TABLE public.dispatcher_vehicle_ext ADD COLUMN IF NOT EXISTS docs_status text;
ALTER TABLE public.dispatcher_vehicle_ext ADD COLUMN IF NOT EXISTS docs_comment text;

-- 3) Drop old / mis-named check constraints
ALTER TABLE public.dispatcher_vehicle_ext DROP CONSTRAINT IF EXISTS dispatcher_vehicle_status_chk;
ALTER TABLE public.dispatcher_vehicle_ext DROP CONSTRAINT IF EXISTS dispatcher_vehicle_ext_status_chk;
ALTER TABLE public.dispatcher_vehicle_ext DROP CONSTRAINT IF EXISTS dispatcher_vehicle_ext_dispatcher_status_chk;

-- 4) Recreate with full status set used in UI/code
ALTER TABLE public.dispatcher_vehicle_ext
  ADD CONSTRAINT dispatcher_vehicle_ext_dispatcher_status_chk
  CHECK (dispatcher_status IS NULL OR dispatcher_status IN (
    'new','docs_unchecked','ready_to_work','available','partially_available',
    'waiting_freight','offered','busy','on_trip','unloading','resting',
    'repair','inactive','blocked','archive','archived'
  ));

-- 5) Also widen driver constraint to include 'ready_to_work' (already present) and a few aliases
ALTER TABLE public.dispatcher_driver_ext DROP CONSTRAINT IF EXISTS dispatcher_driver_status_chk;
ALTER TABLE public.dispatcher_driver_ext
  ADD CONSTRAINT dispatcher_driver_status_chk
  CHECK (dispatcher_status IS NULL OR dispatcher_status IN (
    'new','docs_unchecked','ready_to_work','free','available','on_trip','resting','inactive','blocked','archive','archived'
  ));
