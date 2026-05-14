
CREATE TABLE IF NOT EXISTS public.driver_locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  delivery_route_id UUID NOT NULL REFERENCES public.delivery_routes(id) ON DELETE CASCADE,
  driver_name TEXT,
  latitude NUMERIC NOT NULL,
  longitude NUMERIC NOT NULL,
  accuracy NUMERIC,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_locations_route_time
  ON public.driver_locations (delivery_route_id, captured_at DESC);

ALTER TABLE public.driver_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "driver_locations_select_all" ON public.driver_locations;
DROP POLICY IF EXISTS "driver_locations_insert_all" ON public.driver_locations;

CREATE POLICY "driver_locations_select_all" ON public.driver_locations
  FOR SELECT USING (true);
CREATE POLICY "driver_locations_insert_all" ON public.driver_locations
  FOR INSERT WITH CHECK (true);

ALTER TABLE public.delivery_routes
  ADD COLUMN IF NOT EXISTS last_driver_lat NUMERIC,
  ADD COLUMN IF NOT EXISTS last_driver_lng NUMERIC,
  ADD COLUMN IF NOT EXISTS last_driver_location_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.trg_driver_locations_update_route()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.delivery_routes
     SET last_driver_lat = NEW.latitude,
         last_driver_lng = NEW.longitude,
         last_driver_location_at = NEW.captured_at,
         updated_at = now()
   WHERE id = NEW.delivery_route_id
     AND (last_driver_location_at IS NULL OR last_driver_location_at <= NEW.captured_at);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS driver_locations_update_route ON public.driver_locations;
CREATE TRIGGER driver_locations_update_route
AFTER INSERT ON public.driver_locations
FOR EACH ROW EXECUTE FUNCTION public.trg_driver_locations_update_route();
