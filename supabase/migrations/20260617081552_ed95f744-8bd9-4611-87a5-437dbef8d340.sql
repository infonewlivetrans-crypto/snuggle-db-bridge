
CREATE TABLE IF NOT EXISTS public.dispatcher_trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid REFERENCES public.dispatcher_deals(id) ON DELETE SET NULL,
  carrier_ext_id uuid REFERENCES public.dispatcher_carrier_ext(id) ON DELETE SET NULL,
  vehicle_ext_id uuid REFERENCES public.dispatcher_vehicle_ext(id) ON DELETE SET NULL,
  driver_ext_id uuid REFERENCES public.dispatcher_driver_ext(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'assigned'
    CHECK (status = ANY (ARRAY['assigned','to_pickup','at_pickup','loaded','to_dropoff','at_dropoff','unloaded','delivered','cancelled'])),
  current_point_idx integer NOT NULL DEFAULT 0,
  cargo_summary text,
  weight_kg numeric,
  volume_m3 numeric,
  body_type text,
  rate numeric,
  rate_visible_to_driver boolean NOT NULL DEFAULT false,
  dispatcher_contact text,
  comment text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dispatcher_trip_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.dispatcher_trips(id) ON DELETE CASCADE,
  idx integer NOT NULL,
  kind text NOT NULL CHECK (kind = ANY (ARRAY['pickup','dropoff','waypoint'])),
  city text,
  address text,
  lat numeric,
  lng numeric,
  contact_name text,
  contact_phone text,
  scheduled_at timestamptz,
  comment text,
  status text NOT NULL DEFAULT 'pending' CHECK (status = ANY (ARRAY['pending','arrived','done','skipped'])),
  arrived_at timestamptz,
  done_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dispatcher_trip_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.dispatcher_trips(id) ON DELETE CASCADE,
  point_id uuid REFERENCES public.dispatcher_trip_points(id) ON DELETE SET NULL,
  event text NOT NULL,
  payload jsonb,
  actor_user_id uuid,
  at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dispatcher_trip_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.dispatcher_trips(id) ON DELETE CASCADE,
  point_id uuid REFERENCES public.dispatcher_trip_points(id) ON DELETE SET NULL,
  kind text NOT NULL,
  storage_path text NOT NULL,
  required boolean NOT NULL DEFAULT false,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dispatcher_trips_driver ON public.dispatcher_trips(driver_ext_id);
CREATE INDEX IF NOT EXISTS idx_dispatcher_trips_vehicle ON public.dispatcher_trips(vehicle_ext_id);
CREATE INDEX IF NOT EXISTS idx_dispatcher_trips_carrier ON public.dispatcher_trips(carrier_ext_id);
CREATE INDEX IF NOT EXISTS idx_dispatcher_trips_status ON public.dispatcher_trips(status);
CREATE INDEX IF NOT EXISTS idx_dispatcher_trip_points_trip ON public.dispatcher_trip_points(trip_id, idx);
CREATE INDEX IF NOT EXISTS idx_dispatcher_trip_events_trip ON public.dispatcher_trip_events(trip_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_dispatcher_trip_documents_trip ON public.dispatcher_trip_documents(trip_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispatcher_trips TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispatcher_trip_points TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispatcher_trip_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispatcher_trip_documents TO authenticated;
GRANT ALL ON public.dispatcher_trips TO service_role;
GRANT ALL ON public.dispatcher_trip_points TO service_role;
GRANT ALL ON public.dispatcher_trip_events TO service_role;
GRANT ALL ON public.dispatcher_trip_documents TO service_role;

ALTER TABLE public.dispatcher_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatcher_trip_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatcher_trip_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatcher_trip_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trips_select_own" ON public.dispatcher_trips FOR SELECT TO authenticated
USING (
  driver_ext_id IN (SELECT id FROM public.dispatcher_driver_ext WHERE user_id = auth.uid())
  OR carrier_ext_id IN (SELECT dispatcher_carrier_ext_id FROM public.dispatcher_carrier_users WHERE user_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'dispatcher')
);
CREATE POLICY "trips_insert_dispatcher" ON public.dispatcher_trips FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher'));
CREATE POLICY "trips_update" ON public.dispatcher_trips FOR UPDATE TO authenticated
USING (
  driver_ext_id IN (SELECT id FROM public.dispatcher_driver_ext WHERE user_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'dispatcher')
);

CREATE POLICY "points_select" ON public.dispatcher_trip_points FOR SELECT TO authenticated
USING (
  trip_id IN (
    SELECT id FROM public.dispatcher_trips t
    WHERE t.driver_ext_id IN (SELECT id FROM public.dispatcher_driver_ext WHERE user_id = auth.uid())
       OR t.carrier_ext_id IN (SELECT dispatcher_carrier_ext_id FROM public.dispatcher_carrier_users WHERE user_id = auth.uid())
       OR public.has_role(auth.uid(), 'admin')
       OR public.has_role(auth.uid(), 'dispatcher')
  )
);
CREATE POLICY "points_insert" ON public.dispatcher_trip_points FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher'));
CREATE POLICY "points_update" ON public.dispatcher_trip_points FOR UPDATE TO authenticated
USING (
  trip_id IN (
    SELECT id FROM public.dispatcher_trips t
    WHERE t.driver_ext_id IN (SELECT id FROM public.dispatcher_driver_ext WHERE user_id = auth.uid())
       OR public.has_role(auth.uid(), 'admin')
       OR public.has_role(auth.uid(), 'dispatcher')
  )
);

CREATE POLICY "events_select" ON public.dispatcher_trip_events FOR SELECT TO authenticated
USING (
  trip_id IN (
    SELECT id FROM public.dispatcher_trips t
    WHERE t.driver_ext_id IN (SELECT id FROM public.dispatcher_driver_ext WHERE user_id = auth.uid())
       OR t.carrier_ext_id IN (SELECT dispatcher_carrier_ext_id FROM public.dispatcher_carrier_users WHERE user_id = auth.uid())
       OR public.has_role(auth.uid(), 'admin')
       OR public.has_role(auth.uid(), 'dispatcher')
  )
);
CREATE POLICY "events_insert" ON public.dispatcher_trip_events FOR INSERT TO authenticated
WITH CHECK (
  trip_id IN (
    SELECT id FROM public.dispatcher_trips t
    WHERE t.driver_ext_id IN (SELECT id FROM public.dispatcher_driver_ext WHERE user_id = auth.uid())
       OR public.has_role(auth.uid(), 'admin')
       OR public.has_role(auth.uid(), 'dispatcher')
  )
);

CREATE POLICY "trip_docs_select" ON public.dispatcher_trip_documents FOR SELECT TO authenticated
USING (
  trip_id IN (
    SELECT id FROM public.dispatcher_trips t
    WHERE t.driver_ext_id IN (SELECT id FROM public.dispatcher_driver_ext WHERE user_id = auth.uid())
       OR t.carrier_ext_id IN (SELECT dispatcher_carrier_ext_id FROM public.dispatcher_carrier_users WHERE user_id = auth.uid())
       OR public.has_role(auth.uid(), 'admin')
       OR public.has_role(auth.uid(), 'dispatcher')
  )
);
CREATE POLICY "trip_docs_insert" ON public.dispatcher_trip_documents FOR INSERT TO authenticated
WITH CHECK (
  trip_id IN (
    SELECT id FROM public.dispatcher_trips t
    WHERE t.driver_ext_id IN (SELECT id FROM public.dispatcher_driver_ext WHERE user_id = auth.uid())
       OR public.has_role(auth.uid(), 'admin')
       OR public.has_role(auth.uid(), 'dispatcher')
  )
);

DROP TRIGGER IF EXISTS trg_dispatcher_trips_updated_at ON public.dispatcher_trips;
CREATE TRIGGER trg_dispatcher_trips_updated_at
BEFORE UPDATE ON public.dispatcher_trips
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
