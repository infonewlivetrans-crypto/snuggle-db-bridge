
-- =========================================================================
-- Self-service vehicle readiness: SECURITY DEFINER helpers
-- Allow carrier owners and assigned drivers to update their own vehicle
-- readiness without the service_role key.
-- =========================================================================

-- Ownership check: is _user_id linked to the carrier that owns _vehicle_id?
CREATE OR REPLACE FUNCTION public.user_owns_vehicle_as_carrier(_user_id uuid, _vehicle_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.dispatcher_vehicle_ext v
      JOIN public.dispatcher_carrier_ext c ON c.id = v.dispatcher_carrier_ext_id
     WHERE v.id = _vehicle_id
       AND (
         EXISTS (
           SELECT 1 FROM public.dispatcher_carrier_users u
            WHERE u.dispatcher_carrier_ext_id = c.id
              AND u.user_id = _user_id
              AND u.status = 'active'
         )
         OR EXISTS (
           SELECT 1 FROM public.profiles p
            WHERE p.user_id = _user_id
              AND p.carrier_id IS NOT NULL
              AND (
                p.carrier_id = c.id
                OR p.carrier_id = c.carrier_id
                OR p.carrier_id = c.production_carrier_id
              )
         )
       )
  );
$$;

-- Driver ownership: returns the vehicle ext id assigned to _user_id, or null
CREATE OR REPLACE FUNCTION public.driver_my_vehicle_ext_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.id
    FROM public.dispatcher_vehicle_ext v
   WHERE v.dispatcher_status IS DISTINCT FROM 'archive'
     AND v.dispatcher_driver_ext_id IN (
       SELECT e.id
         FROM public.dispatcher_driver_ext e
        WHERE e.production_driver_id IN (
                SELECT d.id FROM public.drivers d WHERE d.user_id = _user_id
              )
           OR e.driver_id IN (
                SELECT d.id FROM public.drivers d WHERE d.user_id = _user_id
              )
     )
   ORDER BY v.updated_at DESC
   LIMIT 1;
$$;

-- Read readiness for a single vehicle (carrier/driver/admin/dispatcher).
-- Returns the whole row; callers project the columns they need.
CREATE OR REPLACE FUNCTION public.vehicle_readiness_get(p_vehicle_id uuid)
RETURNS SETOF public.dispatcher_vehicle_ext
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_role(uid, 'admin'::public.app_role)
    OR public.has_role(uid, 'dispatcher'::public.app_role)
    OR public.user_owns_vehicle_as_carrier(uid, p_vehicle_id)
    OR public.driver_my_vehicle_ext_id(uid) = p_vehicle_id
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.dispatcher_vehicle_ext WHERE id = p_vehicle_id;
END;
$$;

-- Whitelisted update of readiness fields. Other columns are left untouched.
-- p_patch is a JSON object: only keys present in it are written; an explicit
-- null sets the column to null (so "city changed -> coords cleared" works).
CREATE OR REPLACE FUNCTION public.vehicle_readiness_update(
  p_vehicle_id uuid,
  p_patch jsonb
)
RETURNS public.dispatcher_vehicle_ext
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  out_row public.dispatcher_vehicle_ext;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_role(uid, 'admin'::public.app_role)
    OR public.has_role(uid, 'dispatcher'::public.app_role)
    OR public.user_owns_vehicle_as_carrier(uid, p_vehicle_id)
    OR public.driver_my_vehicle_ext_id(uid) = p_vehicle_id
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.dispatcher_vehicle_ext AS v SET
    current_city = CASE WHEN p_patch ? 'current_city'
        THEN NULLIF(p_patch->>'current_city', '') ELSE v.current_city END,
    current_lat = CASE WHEN p_patch ? 'current_lat'
        THEN NULLIF(p_patch->>'current_lat', '')::numeric ELSE v.current_lat END,
    current_lng = CASE WHEN p_patch ? 'current_lng'
        THEN NULLIF(p_patch->>'current_lng', '')::numeric ELSE v.current_lng END,
    ready_to_cities = CASE WHEN p_patch ? 'ready_to_cities'
        THEN (
          SELECT COALESCE(array_agg(x), ARRAY[]::text[])
            FROM jsonb_array_elements_text(p_patch->'ready_to_cities') AS x
        )
        ELSE v.ready_to_cities END,
    ready_radius_km = CASE WHEN p_patch ? 'ready_radius_km'
        THEN NULLIF(p_patch->>'ready_radius_km', '')::int ELSE v.ready_radius_km END,
    ready_mode = CASE WHEN p_patch ? 'ready_mode'
        THEN NULLIF(p_patch->>'ready_mode', '') ELSE v.ready_mode END,
    ready_weekdays = CASE WHEN p_patch ? 'ready_weekdays'
        THEN (
          SELECT COALESCE(array_agg(x::int), ARRAY[]::int[])
            FROM jsonb_array_elements_text(p_patch->'ready_weekdays') AS x
        )
        ELSE v.ready_weekdays END,
    ready_from = CASE WHEN p_patch ? 'ready_from'
        THEN NULLIF(p_patch->>'ready_from', '')::date ELSE v.ready_from END,
    ready_date = CASE WHEN p_patch ? 'ready_date'
        THEN NULLIF(p_patch->>'ready_date', '')::date ELSE v.ready_date END,
    ready_comment = CASE WHEN p_patch ? 'ready_comment'
        THEN p_patch->>'ready_comment' ELSE v.ready_comment END,
    load_status = CASE WHEN p_patch ? 'load_status'
        THEN COALESCE(NULLIF(p_patch->>'load_status', ''), v.load_status) ELSE v.load_status END,
    free_payload_kg = CASE WHEN p_patch ? 'free_payload_kg'
        THEN NULLIF(p_patch->>'free_payload_kg', '')::numeric ELSE v.free_payload_kg END,
    free_volume_m3 = CASE WHEN p_patch ? 'free_volume_m3'
        THEN NULLIF(p_patch->>'free_volume_m3', '')::numeric ELSE v.free_volume_m3 END,
    partial_route_from = CASE WHEN p_patch ? 'partial_route_from'
        THEN p_patch->>'partial_route_from' ELSE v.partial_route_from END,
    partial_route_to = CASE WHEN p_patch ? 'partial_route_to'
        THEN p_patch->>'partial_route_to' ELSE v.partial_route_to END,
    loading_restrictions = CASE WHEN p_patch ? 'loading_restrictions'
        THEN p_patch->>'loading_restrictions' ELSE v.loading_restrictions END,
    location_source = CASE WHEN p_patch ? 'location_source'
        THEN NULLIF(p_patch->>'location_source', '') ELSE v.location_source END,
    location_updated_at = CASE WHEN p_patch ? 'location_updated_at'
        THEN NULLIF(p_patch->>'location_updated_at', '')::timestamptz
        ELSE v.location_updated_at END
  WHERE v.id = p_vehicle_id
  RETURNING v.* INTO out_row;

  IF out_row.id IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  RETURN out_row;
END;
$$;

REVOKE ALL ON FUNCTION public.user_owns_vehicle_as_carrier(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.driver_my_vehicle_ext_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vehicle_readiness_get(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vehicle_readiness_update(uuid, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.user_owns_vehicle_as_carrier(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.driver_my_vehicle_ext_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vehicle_readiness_get(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vehicle_readiness_update(uuid, jsonb) TO authenticated;

GRANT EXECUTE ON FUNCTION public.user_owns_vehicle_as_carrier(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.driver_my_vehicle_ext_id(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.vehicle_readiness_get(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.vehicle_readiness_update(uuid, jsonb) TO service_role;
