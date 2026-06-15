
-- Carrier cabinet: SECURITY DEFINER helpers + RLS without service_role.

-- 1) Resolve carrier ext id for current user (auth.uid()) using the same chain:
--    dispatcher_carrier_users (active) → profiles.carrier_id matched against
--    dispatcher_carrier_ext.id / carrier_id / production_carrier_id.
CREATE OR REPLACE FUNCTION public.carrier_my_ext_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_ext uuid;
  v_profile_carrier uuid;
BEGIN
  IF v_user IS NULL THEN RETURN NULL; END IF;

  SELECT dcu.dispatcher_carrier_ext_id INTO v_ext
  FROM public.dispatcher_carrier_users dcu
  WHERE dcu.user_id = v_user
    AND dcu.status = 'active'
  ORDER BY dcu.created_at ASC
  LIMIT 1;
  IF v_ext IS NOT NULL THEN RETURN v_ext; END IF;

  SELECT carrier_id INTO v_profile_carrier
  FROM public.profiles WHERE user_id = v_user LIMIT 1;
  IF v_profile_carrier IS NULL THEN RETURN NULL; END IF;

  SELECT id INTO v_ext FROM public.dispatcher_carrier_ext WHERE id = v_profile_carrier LIMIT 1;
  IF v_ext IS NOT NULL THEN RETURN v_ext; END IF;
  SELECT id INTO v_ext FROM public.dispatcher_carrier_ext WHERE carrier_id = v_profile_carrier LIMIT 1;
  IF v_ext IS NOT NULL THEN RETURN v_ext; END IF;
  SELECT id INTO v_ext FROM public.dispatcher_carrier_ext WHERE production_carrier_id = v_profile_carrier LIMIT 1;
  RETURN v_ext;
END;
$$;

GRANT EXECUTE ON FUNCTION public.carrier_my_ext_id() TO authenticated;

-- 2) Full "me" payload: profile, carrier, ext, vehicles, drivers.
CREATE OR REPLACE FUNCTION public.carrier_me_get()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_ext_id uuid;
  v_ext jsonb;
  v_carrier_id uuid;
  v_carrier jsonb;
  v_profile jsonb;
  v_profile_carrier uuid;
  v_vehicles jsonb;
  v_drivers jsonb;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  SELECT to_jsonb(p) - 'company_id' INTO v_profile
  FROM public.profiles p WHERE p.user_id = v_user LIMIT 1;

  v_profile_carrier := (v_profile->>'carrier_id')::uuid;
  v_ext_id := public.carrier_my_ext_id();

  IF v_ext_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'no_carrier_linked',
      'reason', 'no_carrier_linked',
      'user_id', v_user,
      'profile_carrier_id', v_profile_carrier,
      'profile', v_profile
    );
  END IF;

  SELECT to_jsonb(e), e.carrier_id INTO v_ext, v_carrier_id
  FROM public.dispatcher_carrier_ext e WHERE e.id = v_ext_id;

  IF v_carrier_id IS NULL THEN v_carrier_id := v_profile_carrier; END IF;

  IF v_carrier_id IS NOT NULL THEN
    SELECT to_jsonb(c) INTO v_carrier
    FROM public.carriers c WHERE c.id = v_carrier_id;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', v.id, 'plate_number', v.plate_number, 'brand', v.brand,
      'model', v.model, 'body_type', v.body_type,
      'capacity_kg', v.capacity_kg, 'volume_m3', v.volume_m3,
      'is_active', v.is_active
    ) ORDER BY v.created_at DESC), '[]'::jsonb) INTO v_vehicles
    FROM public.vehicles v WHERE v.carrier_id = v_carrier_id;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', d.id, 'full_name', d.full_name, 'phone', d.phone, 'is_active', d.is_active
    ) ORDER BY d.created_at DESC), '[]'::jsonb) INTO v_drivers
    FROM public.drivers d WHERE d.carrier_id = v_carrier_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'profile', v_profile,
    'carrier', v_carrier,
    'ext', v_ext,
    'vehicles', COALESCE(v_vehicles, '[]'::jsonb),
    'drivers', COALESCE(v_drivers, '[]'::jsonb),
    'trips', '[]'::jsonb
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.carrier_me_get() TO authenticated;

-- 3) RLS: carrier can SELECT/UPDATE own dispatcher_carrier_ext row.
DROP POLICY IF EXISTS "dce carrier read own" ON public.dispatcher_carrier_ext;
CREATE POLICY "dce carrier read own"
ON public.dispatcher_carrier_ext FOR SELECT TO authenticated
USING (id = public.carrier_my_ext_id());

DROP POLICY IF EXISTS "dce carrier update own" ON public.dispatcher_carrier_ext;
CREATE POLICY "dce carrier update own"
ON public.dispatcher_carrier_ext FOR UPDATE TO authenticated
USING (id = public.carrier_my_ext_id())
WITH CHECK (id = public.carrier_my_ext_id());

-- 4) RLS: carrier can SELECT dispatcher_freights tied to own requests.
DROP POLICY IF EXISTS "df carrier read own" ON public.dispatcher_freights;
CREATE POLICY "df carrier read own"
ON public.dispatcher_freights FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.dispatcher_carrier_requests r
    WHERE r.id = dispatcher_freights.carrier_request_id
      AND r.dispatcher_carrier_ext_id = public.carrier_my_ext_id()
  )
);
