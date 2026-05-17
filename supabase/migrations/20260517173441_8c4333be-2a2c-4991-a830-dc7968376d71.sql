
-- Yandex cache write RPCs (SECURITY DEFINER, no service_role needed)

CREATE OR REPLACE FUNCTION public.upsert_geocode_cache(
  p_cache_key text,
  p_kind text,
  p_query text,
  p_lat numeric,
  p_lng numeric,
  p_formatted_address text,
  p_raw jsonb,
  p_ttl_days integer DEFAULT 90
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF p_cache_key IS NULL OR length(p_cache_key) = 0 OR length(p_cache_key) > 128 THEN
    RAISE EXCEPTION 'invalid cache_key' USING ERRCODE = '22023';
  END IF;
  IF p_kind NOT IN ('forward','reverse') THEN
    RAISE EXCEPTION 'invalid kind' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.geocode_cache(
    cache_key, kind, query, lat, lng, formatted_address, raw, expires_at
  ) VALUES (
    p_cache_key, p_kind, COALESCE(p_query,''), p_lat, p_lng,
    p_formatted_address, p_raw,
    now() + make_interval(days => GREATEST(1, COALESCE(p_ttl_days, 90)))
  )
  ON CONFLICT (cache_key) DO UPDATE
    SET kind = EXCLUDED.kind,
        query = EXCLUDED.query,
        lat = EXCLUDED.lat,
        lng = EXCLUDED.lng,
        formatted_address = EXCLUDED.formatted_address,
        raw = EXCLUDED.raw,
        expires_at = EXCLUDED.expires_at;
END $$;

CREATE OR REPLACE FUNCTION public.upsert_route_matrix_cache(
  p_cache_key text,
  p_origins jsonb,
  p_destinations jsonb,
  p_matrix jsonb,
  p_ttl_days integer DEFAULT 7
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF p_cache_key IS NULL OR length(p_cache_key) = 0 OR length(p_cache_key) > 128 THEN
    RAISE EXCEPTION 'invalid cache_key' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.route_matrix_cache(
    cache_key, origins, destinations, matrix, expires_at
  ) VALUES (
    p_cache_key, p_origins, p_destinations, p_matrix,
    now() + make_interval(days => GREATEST(1, COALESCE(p_ttl_days, 7)))
  )
  ON CONFLICT (cache_key) DO UPDATE
    SET origins = EXCLUDED.origins,
        destinations = EXCLUDED.destinations,
        matrix = EXCLUDED.matrix,
        expires_at = EXCLUDED.expires_at;
END $$;

CREATE OR REPLACE FUNCTION public.upsert_route_geometry_cache(
  p_cache_key text,
  p_waypoints jsonb,
  p_distance_m integer,
  p_duration_s integer,
  p_geometry jsonb,
  p_segments jsonb,
  p_ttl_days integer DEFAULT 7
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF p_cache_key IS NULL OR length(p_cache_key) = 0 OR length(p_cache_key) > 128 THEN
    RAISE EXCEPTION 'invalid cache_key' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.route_geometry_cache(
    cache_key, waypoints, distance_m, duration_s, geometry, segments, expires_at
  ) VALUES (
    p_cache_key, p_waypoints, p_distance_m, p_duration_s, p_geometry, p_segments,
    now() + make_interval(days => GREATEST(1, COALESCE(p_ttl_days, 7)))
  )
  ON CONFLICT (cache_key) DO UPDATE
    SET waypoints = EXCLUDED.waypoints,
        distance_m = EXCLUDED.distance_m,
        duration_s = EXCLUDED.duration_s,
        geometry = EXCLUDED.geometry,
        segments = EXCLUDED.segments,
        expires_at = EXCLUDED.expires_at;
END $$;

REVOKE ALL ON FUNCTION public.upsert_geocode_cache(text,text,text,numeric,numeric,text,jsonb,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_route_matrix_cache(text,jsonb,jsonb,jsonb,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_route_geometry_cache(text,jsonb,integer,integer,jsonb,jsonb,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_geocode_cache(text,text,text,numeric,numeric,text,jsonb,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_route_matrix_cache(text,jsonb,jsonb,jsonb,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_route_geometry_cache(text,jsonb,integer,integer,jsonb,jsonb,integer) TO authenticated;
