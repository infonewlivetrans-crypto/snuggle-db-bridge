ALTER TABLE public.dispatcher_vehicle_ext
  ADD COLUMN IF NOT EXISTS load_status text NOT NULL DEFAULT 'empty',
  ADD COLUMN IF NOT EXISTS free_payload_kg numeric,
  ADD COLUMN IF NOT EXISTS free_volume_m3 numeric,
  ADD COLUMN IF NOT EXISTS partial_route_from text,
  ADD COLUMN IF NOT EXISTS partial_route_to text,
  ADD COLUMN IF NOT EXISTS loading_restrictions text;

CREATE INDEX IF NOT EXISTS idx_dispatcher_vehicle_ext_load_status
  ON public.dispatcher_vehicle_ext (load_status);