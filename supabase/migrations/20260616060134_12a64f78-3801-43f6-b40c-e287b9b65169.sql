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
    ready_to_cities = CASE
        WHEN p_patch ? 'ready_to_cities' AND jsonb_typeof(p_patch->'ready_to_cities') = 'array'
          THEN (SELECT COALESCE(array_agg(x), ARRAY[]::text[])
                FROM jsonb_array_elements_text(p_patch->'ready_to_cities') AS x)
        WHEN p_patch ? 'ready_to_cities' AND jsonb_typeof(p_patch->'ready_to_cities') = 'null'
          THEN NULL
        ELSE v.ready_to_cities END,
    ready_radius_km = CASE WHEN p_patch ? 'ready_radius_km'
        THEN NULLIF(p_patch->>'ready_radius_km', '')::int ELSE v.ready_radius_km END,
    ready_mode = CASE WHEN p_patch ? 'ready_mode'
        THEN NULLIF(p_patch->>'ready_mode', '') ELSE v.ready_mode END,
    ready_weekdays = CASE
        WHEN p_patch ? 'ready_weekdays' AND jsonb_typeof(p_patch->'ready_weekdays') = 'array'
          THEN (SELECT COALESCE(array_agg(x::int), ARRAY[]::int[])
                FROM jsonb_array_elements_text(p_patch->'ready_weekdays') AS x)
        WHEN p_patch ? 'ready_weekdays' AND jsonb_typeof(p_patch->'ready_weekdays') = 'null'
          THEN NULL
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