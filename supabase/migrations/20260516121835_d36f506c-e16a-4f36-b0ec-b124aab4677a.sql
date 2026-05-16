-- ============================================================================
-- Hotfix for release branch 5.2–5.7
-- Reason: migration 20260516104752 aborted on prod with
--   "ERROR: column d.user_id does not exist"
-- because _driver_can_access_order (LANGUAGE sql, validated at CREATE time)
-- references public.drivers.user_id, which was not present on that environment.
--
-- Canonical relationship (kept as-is): public.drivers.user_id -> auth.users.id
-- Adding the column through profiles would BROADEN driver access (any user of
-- the same carrier could see orders), which we explicitly do NOT want.
--
-- This migration is fully idempotent and safe to apply over a partially-applied
-- 20260516104752.
-- ============================================================================

-- 1) Ensure canonical link column exists.
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS drivers_user_id_key
  ON public.drivers(user_id)
  WHERE user_id IS NOT NULL;

-- 2) Re-apply 20260516104752 DDL idempotently (in case it aborted mid-file).

CREATE TABLE IF NOT EXISTS public.client_order_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  target_role text NOT NULL CHECK (target_role IN ('manager','driver')),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_by_manager_at timestamptz NULL,
  read_by_driver_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_com_order_target_created
  ON public.client_order_messages (order_id, target_role, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_com_client
  ON public.client_order_messages (client_id);
CREATE INDEX IF NOT EXISTS idx_com_unread_manager
  ON public.client_order_messages (order_id)
  WHERE read_by_manager_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_com_unread_driver
  ON public.client_order_messages (order_id)
  WHERE read_by_driver_at IS NULL AND target_role = 'driver';

ALTER TABLE public.client_order_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_order_messages FROM anon, authenticated;

-- 3) Re-create the function that originally aborted prod migration.
CREATE OR REPLACE FUNCTION public._driver_can_access_order(_user_id uuid, _order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.route_points rp
    JOIN public.delivery_routes dr ON dr.id = rp.route_id
    JOIN public.drivers d ON d.id = dr.driver_id
    WHERE rp.order_id = _order_id
      AND d.user_id = _user_id
  );
$$;

REVOKE ALL ON FUNCTION public._driver_can_access_order(uuid, uuid) FROM PUBLIC;

-- 4) Re-create RPCs from 20260516104752 (idempotent CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.post_client_order_message(
  _token text, _order_id uuid, _target_role text, _body text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_client_id uuid;
  v_body text;
  v_id uuid;
BEGIN
  IF _token IS NULL OR length(btrim(_token)) < 16 THEN
    RAISE EXCEPTION 'invalid_token' USING ERRCODE = '22023';
  END IF;
  IF _target_role NOT IN ('manager','driver') THEN
    RAISE EXCEPTION 'invalid_target_role' USING ERRCODE = '22023';
  END IF;
  v_body := btrim(coalesce(_body,''));
  IF char_length(v_body) < 1 OR char_length(v_body) > 2000 THEN
    RAISE EXCEPTION 'invalid_body' USING ERRCODE = '22023';
  END IF;
  SELECT c.id INTO v_client_id FROM public.clients c
   WHERE c.portal_token = _token
     AND c.portal_access_enabled = true
     AND c.portal_token_revoked_at IS NULL
   LIMIT 1;
  IF v_client_id IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.orders o WHERE o.id = _order_id AND o.client_id = v_client_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  INSERT INTO public.client_order_messages (order_id, client_id, target_role, body)
  VALUES (_order_id, v_client_id, _target_role, v_body)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.list_client_order_messages(
  _token text, _order_id uuid, _target_role text DEFAULT NULL
) RETURNS TABLE (
  id uuid, target_role text, body text, created_at timestamptz,
  read_by_manager_at timestamptz, read_by_driver_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_client_id uuid;
BEGIN
  IF _token IS NULL OR length(btrim(_token)) < 16 THEN
    RAISE EXCEPTION 'invalid_token' USING ERRCODE='22023';
  END IF;
  IF _target_role IS NOT NULL AND _target_role NOT IN ('manager','driver') THEN
    RAISE EXCEPTION 'invalid_target_role' USING ERRCODE='22023';
  END IF;
  SELECT c.id INTO v_client_id FROM public.clients c
   WHERE c.portal_token = _token
     AND c.portal_access_enabled = true
     AND c.portal_token_revoked_at IS NULL
   LIMIT 1;
  IF v_client_id IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.orders o WHERE o.id = _order_id AND o.client_id = v_client_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT m.id, m.target_role, m.body, m.created_at,
         m.read_by_manager_at, m.read_by_driver_at
  FROM public.client_order_messages m
  WHERE m.order_id = _order_id AND m.client_id = v_client_id
    AND (_target_role IS NULL OR m.target_role = _target_role)
  ORDER BY m.created_at ASC;
END $$;

CREATE OR REPLACE FUNCTION public.list_order_client_messages_for_staff(_order_id uuid)
RETURNS TABLE (
  id uuid, target_role text, body text, created_at timestamptz,
  read_by_manager_at timestamptz, read_by_driver_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  IF NOT (
    public.has_role(v_uid,'admin'::app_role)
    OR public.has_role(v_uid,'logist'::app_role)
    OR public.has_role(v_uid,'manager'::app_role)
  ) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT m.id, m.target_role, m.body, m.created_at,
         m.read_by_manager_at, m.read_by_driver_at
  FROM public.client_order_messages m
  WHERE m.order_id = _order_id
  ORDER BY m.created_at ASC;
END $$;

CREATE OR REPLACE FUNCTION public.mark_order_client_messages_read_by_manager(_order_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_count integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  IF NOT (
    public.has_role(v_uid,'admin'::app_role)
    OR public.has_role(v_uid,'logist'::app_role)
    OR public.has_role(v_uid,'manager'::app_role)
  ) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  UPDATE public.client_order_messages
     SET read_by_manager_at = now()
   WHERE order_id = _order_id AND read_by_manager_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

CREATE OR REPLACE FUNCTION public.list_order_driver_client_messages(_order_id uuid)
RETURNS TABLE (
  id uuid, target_role text, body text, created_at timestamptz,
  read_by_manager_at timestamptz, read_by_driver_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_is_admin boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  v_is_admin := public.has_role(v_uid,'admin'::app_role);
  IF NOT v_is_admin THEN
    IF NOT public.has_role(v_uid,'driver'::app_role) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
    END IF;
    IF NOT public._driver_can_access_order(v_uid, _order_id) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN QUERY
  SELECT m.id, m.target_role, m.body, m.created_at,
         m.read_by_manager_at, m.read_by_driver_at
  FROM public.client_order_messages m
  WHERE m.order_id = _order_id AND m.target_role = 'driver'
  ORDER BY m.created_at ASC;
END $$;

CREATE OR REPLACE FUNCTION public.mark_order_driver_client_messages_read(_order_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_is_admin boolean; v_count integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  v_is_admin := public.has_role(v_uid,'admin'::app_role);
  IF NOT v_is_admin THEN
    IF NOT public.has_role(v_uid,'driver'::app_role) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
    END IF;
    IF NOT public._driver_can_access_order(v_uid, _order_id) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
    END IF;
  END IF;
  UPDATE public.client_order_messages
     SET read_by_driver_at = now()
   WHERE order_id = _order_id AND target_role = 'driver'
     AND read_by_driver_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

-- 5) Re-grant execute (idempotent).
REVOKE ALL ON FUNCTION public.post_client_order_message(text, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_client_order_messages(text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_order_client_messages_for_staff(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_order_client_messages_read_by_manager(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_order_driver_client_messages(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_order_driver_client_messages_read(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.post_client_order_message(text, uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_client_order_messages(text, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_order_client_messages_for_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_order_client_messages_read_by_manager(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_order_driver_client_messages(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_order_driver_client_messages_read(uuid) TO authenticated;