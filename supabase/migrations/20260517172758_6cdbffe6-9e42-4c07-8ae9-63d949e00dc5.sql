
-- Yandex geo/routing cache + delivery_routes geometry fields

CREATE TABLE IF NOT EXISTS public.geocode_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('forward','reverse')),
  query text NOT NULL,
  lat numeric,
  lng numeric,
  formatted_address text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days')
);
CREATE INDEX IF NOT EXISTS idx_geocode_cache_expires ON public.geocode_cache(expires_at);

CREATE TABLE IF NOT EXISTS public.route_matrix_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text NOT NULL UNIQUE,
  origins jsonb NOT NULL,
  destinations jsonb NOT NULL,
  matrix jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);
CREATE INDEX IF NOT EXISTS idx_route_matrix_cache_expires ON public.route_matrix_cache(expires_at);

CREATE TABLE IF NOT EXISTS public.route_geometry_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text NOT NULL UNIQUE,
  waypoints jsonb NOT NULL,
  distance_m integer,
  duration_s integer,
  geometry jsonb NOT NULL,
  segments jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);
CREATE INDEX IF NOT EXISTS idx_route_geometry_cache_expires ON public.route_geometry_cache(expires_at);

ALTER TABLE public.geocode_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_matrix_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_geometry_cache ENABLE ROW LEVEL SECURITY;

-- Read-only for any authenticated user; writes only via service role (server endpoints).
CREATE POLICY "geocode_cache_select_auth" ON public.geocode_cache
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "route_matrix_cache_select_auth" ON public.route_matrix_cache
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "route_geometry_cache_select_auth" ON public.route_geometry_cache
  FOR SELECT TO authenticated USING (true);

-- delivery_routes: precomputed routing fields
ALTER TABLE public.delivery_routes
  ADD COLUMN IF NOT EXISTS route_distance_m integer,
  ADD COLUMN IF NOT EXISTS route_duration_s integer,
  ADD COLUMN IF NOT EXISTS route_geometry jsonb,
  ADD COLUMN IF NOT EXISTS route_segments jsonb,
  ADD COLUMN IF NOT EXISTS route_eta_computed_at timestamptz;
