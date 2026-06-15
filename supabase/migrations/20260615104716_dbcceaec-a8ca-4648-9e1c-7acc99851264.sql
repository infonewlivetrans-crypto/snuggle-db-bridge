
-- Carrier RLS: own vehicles & drivers in dispatcher_vehicle_ext / dispatcher_driver_ext.

-- VEHICLES -----------------------------------------------------------
DROP POLICY IF EXISTS "dve carrier read own" ON public.dispatcher_vehicle_ext;
CREATE POLICY "dve carrier read own"
ON public.dispatcher_vehicle_ext FOR SELECT TO authenticated
USING (
  dispatcher_carrier_ext_id IS NOT NULL
  AND dispatcher_carrier_ext_id = public.carrier_my_ext_id()
);

DROP POLICY IF EXISTS "dve carrier insert own" ON public.dispatcher_vehicle_ext;
CREATE POLICY "dve carrier insert own"
ON public.dispatcher_vehicle_ext FOR INSERT TO authenticated
WITH CHECK (
  dispatcher_carrier_ext_id IS NOT NULL
  AND dispatcher_carrier_ext_id = public.carrier_my_ext_id()
);

DROP POLICY IF EXISTS "dve carrier update own" ON public.dispatcher_vehicle_ext;
CREATE POLICY "dve carrier update own"
ON public.dispatcher_vehicle_ext FOR UPDATE TO authenticated
USING (
  dispatcher_carrier_ext_id IS NOT NULL
  AND dispatcher_carrier_ext_id = public.carrier_my_ext_id()
)
WITH CHECK (
  dispatcher_carrier_ext_id IS NOT NULL
  AND dispatcher_carrier_ext_id = public.carrier_my_ext_id()
);

-- DRIVERS ------------------------------------------------------------
DROP POLICY IF EXISTS "dde carrier read own" ON public.dispatcher_driver_ext;
CREATE POLICY "dde carrier read own"
ON public.dispatcher_driver_ext FOR SELECT TO authenticated
USING (
  dispatcher_carrier_ext_id IS NOT NULL
  AND dispatcher_carrier_ext_id = public.carrier_my_ext_id()
);

DROP POLICY IF EXISTS "dde carrier insert own" ON public.dispatcher_driver_ext;
CREATE POLICY "dde carrier insert own"
ON public.dispatcher_driver_ext FOR INSERT TO authenticated
WITH CHECK (
  dispatcher_carrier_ext_id IS NOT NULL
  AND dispatcher_carrier_ext_id = public.carrier_my_ext_id()
);

DROP POLICY IF EXISTS "dde carrier update own" ON public.dispatcher_driver_ext;
CREATE POLICY "dde carrier update own"
ON public.dispatcher_driver_ext FOR UPDATE TO authenticated
USING (
  dispatcher_carrier_ext_id IS NOT NULL
  AND dispatcher_carrier_ext_id = public.carrier_my_ext_id()
)
WITH CHECK (
  dispatcher_carrier_ext_id IS NOT NULL
  AND dispatcher_carrier_ext_id = public.carrier_my_ext_id()
);
