
-- Staff RPC to enable/disable client portal without touching the token
CREATE OR REPLACE FUNCTION public.staff_set_portal_enabled(_client_id uuid, _enabled boolean)
RETURNS TABLE (
  has_token boolean,
  active boolean,
  portal_token_created_at timestamptz,
  portal_token_revoked_at timestamptz,
  portal_access_enabled boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company_id uuid;
  v_token text;
  v_revoked_at timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_role(v_uid, 'admin'::app_role)
    OR public.has_role(v_uid, 'logist'::app_role)
    OR public.has_role(v_uid, 'manager'::app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT c.company_id, c.portal_token, c.portal_token_revoked_at
    INTO v_company_id, v_token, v_revoked_at
  FROM public.clients c
  WHERE c.id = _client_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_company_id IS NOT NULL AND NOT public.has_company_access(v_uid, v_company_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF _enabled THEN
    IF v_token IS NULL THEN
      RAISE EXCEPTION 'portal_token_missing' USING ERRCODE = '22023';
    END IF;
    IF v_revoked_at IS NOT NULL THEN
      RAISE EXCEPTION 'portal_token_revoked' USING ERRCODE = '22023';
    END IF;
    UPDATE public.clients SET portal_access_enabled = true WHERE id = _client_id;
  ELSE
    UPDATE public.clients SET portal_access_enabled = false WHERE id = _client_id;
  END IF;

  RETURN QUERY
  SELECT
    (c.portal_token IS NOT NULL) AS has_token,
    (c.portal_token IS NOT NULL AND c.portal_access_enabled AND c.portal_token_revoked_at IS NULL) AS active,
    c.portal_token_created_at,
    c.portal_token_revoked_at,
    c.portal_access_enabled
  FROM public.clients c
  WHERE c.id = _client_id;
END;
$$;

REVOKE ALL ON FUNCTION public.staff_set_portal_enabled(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_set_portal_enabled(uuid, boolean) TO authenticated;

-- Staff RPC to rotate (regenerate) the client portal token
CREATE OR REPLACE FUNCTION public.staff_rotate_portal_token(_client_id uuid)
RETURNS TABLE (
  has_token boolean,
  active boolean,
  portal_token text,
  portal_token_created_at timestamptz,
  portal_token_revoked_at timestamptz,
  portal_access_enabled boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company_id uuid;
  v_new_token text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_role(v_uid, 'admin'::app_role)
    OR public.has_role(v_uid, 'logist'::app_role)
    OR public.has_role(v_uid, 'manager'::app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT c.company_id INTO v_company_id FROM public.clients c WHERE c.id = _client_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_company_id IS NOT NULL AND NOT public.has_company_access(v_uid, v_company_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- URL-safe token: base64url of 32 random bytes
  v_new_token := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');

  UPDATE public.clients
  SET portal_token = v_new_token,
      portal_token_created_at = now(),
      portal_token_revoked_at = NULL,
      portal_access_enabled = true
  WHERE id = _client_id;

  RETURN QUERY
  SELECT
    true AS has_token,
    true AS active,
    c.portal_token,
    c.portal_token_created_at,
    c.portal_token_revoked_at,
    c.portal_access_enabled
  FROM public.clients c
  WHERE c.id = _client_id;
END;
$$;

REVOKE ALL ON FUNCTION public.staff_rotate_portal_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_rotate_portal_token(uuid) TO authenticated;
