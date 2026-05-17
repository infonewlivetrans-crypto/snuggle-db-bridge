
-- ============================================================
-- 1) Cleanup orphan invites (none activated) + their auth users
-- ============================================================
DO $$
DECLARE
  v_ids uuid[] := ARRAY[
    '61260826-9beb-4f96-91b4-7f5f85d3a66c'::uuid,
    '3b332cfb-763d-41d3-8773-2cf5d1612bf8'::uuid
  ];
BEGIN
  DELETE FROM public.invite_tokens WHERE user_id = ANY(v_ids);
  UPDATE public.drivers  SET user_id = NULL WHERE user_id = ANY(v_ids);
  UPDATE public.managers SET user_id = NULL WHERE user_id = ANY(v_ids);
  DELETE FROM public.user_roles WHERE user_id = ANY(v_ids);
  DELETE FROM public.profiles  WHERE user_id = ANY(v_ids);
  DELETE FROM auth.identities  WHERE user_id = ANY(v_ids);
  DELETE FROM auth.users       WHERE id      = ANY(v_ids);
END $$;

-- ============================================================
-- 2) Schema changes on invite_tokens
-- ============================================================
ALTER TABLE public.invite_tokens
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.invite_tokens
  ADD COLUMN IF NOT EXISTS activated_at  timestamptz,
  ADD COLUMN IF NOT EXISTS activated_email text;

-- ============================================================
-- 3) Drop old (rejected) RPCs
-- ============================================================
DROP FUNCTION IF EXISTS public.admin_create_invite(text, text, app_role, text, uuid, text);
DROP FUNCTION IF EXISTS public.admin_create_invite(text, text, text, text, uuid, text);
DROP FUNCTION IF EXISTS public.admin_rotate_invite_token(uuid);

-- Helper: check that caller has admin role
CREATE OR REPLACE FUNCTION public._caller_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;

-- Helper: random URL-safe token (~22 chars, 128 bit)
CREATE OR REPLACE FUNCTION public._gen_invite_token()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public, extensions
AS $$
DECLARE
  v_bytes bytea;
  v_b64   text;
BEGIN
  v_bytes := extensions.gen_random_bytes(16);
  v_b64   := encode(v_bytes, 'base64');
  v_b64   := translate(v_b64, '+/', '-_');
  v_b64   := replace(v_b64, '=', '');
  RETURN v_b64;
END $$;

-- ============================================================
-- 4) admin_issue_invite — creates only an invite_tokens row
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_issue_invite(
  p_full_name    text,
  p_phone        text,
  p_role         app_role,
  p_comment      text,
  p_driver_id    uuid,
  p_manager_name text
)
RETURNS public.invite_tokens
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_token  text;
  v_row    public.invite_tokens;
  v_manager_id uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF NOT public._caller_is_admin() THEN
    RAISE EXCEPTION 'forbidden: admin role required';
  END IF;
  IF p_role NOT IN ('admin','logist','manager','driver') THEN
    RAISE EXCEPTION 'invalid role';
  END IF;
  IF coalesce(btrim(p_full_name), '') = '' THEN
    RAISE EXCEPTION 'full_name required';
  END IF;

  v_token := public._gen_invite_token();

  -- For manager invites: try resolve existing manager by name (optional)
  IF p_role = 'manager' AND coalesce(btrim(p_manager_name), '') <> '' THEN
    SELECT id INTO v_manager_id
    FROM public.managers
    WHERE lower(btrim(full_name)) = lower(btrim(p_manager_name))
    LIMIT 1;
  END IF;

  INSERT INTO public.invite_tokens (
    token, user_id, full_name, phone, role, comment,
    driver_id, manager_id, manager_name, is_active, created_by
  ) VALUES (
    v_token, NULL, btrim(p_full_name), nullif(btrim(p_phone), ''), p_role, nullif(btrim(p_comment), ''),
    p_driver_id, v_manager_id, nullif(btrim(p_manager_name), ''), true, v_caller
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END $$;

-- ============================================================
-- 5) admin_rotate_invite — only if not yet activated
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_rotate_invite(p_invite_id uuid)
RETURNS public.invite_tokens
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.invite_tokens;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF NOT public._caller_is_admin() THEN
    RAISE EXCEPTION 'forbidden: admin role required';
  END IF;

  SELECT * INTO v_row FROM public.invite_tokens WHERE id = p_invite_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite not found';
  END IF;
  IF v_row.activated_at IS NOT NULL THEN
    RAISE EXCEPTION 'invite already activated — use password reset instead';
  END IF;

  UPDATE public.invite_tokens
     SET token = public._gen_invite_token(),
         is_active = true,
         updated_at = now()
   WHERE id = p_invite_id
   RETURNING * INTO v_row;

  RETURN v_row;
END $$;

-- ============================================================
-- 6) admin_set_invite_active
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_set_invite_active(p_invite_id uuid, p_active boolean)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF NOT public._caller_is_admin() THEN
    RAISE EXCEPTION 'forbidden: admin role required';
  END IF;
  UPDATE public.invite_tokens
     SET is_active = p_active, updated_at = now()
   WHERE id = p_invite_id;
END $$;

-- ============================================================
-- 7) admin_delete_invite — only if not activated
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_delete_invite(p_invite_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.invite_tokens;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF NOT public._caller_is_admin() THEN
    RAISE EXCEPTION 'forbidden: admin role required';
  END IF;
  SELECT * INTO v_row FROM public.invite_tokens WHERE id = p_invite_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_row.activated_at IS NOT NULL THEN
    RAISE EXCEPTION 'invite already activated — disable user instead';
  END IF;
  DELETE FROM public.invite_tokens WHERE id = p_invite_id;
END $$;

-- ============================================================
-- 8) get_invite_public — safe public read by token
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_invite_public(p_token text)
RETURNS TABLE (
  full_name        text,
  role             app_role,
  phone            text,
  manager_name     text,
  is_active        boolean,
  already_activated boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT it.full_name, it.role, it.phone, it.manager_name,
         it.is_active, (it.activated_at IS NOT NULL) AS already_activated
  FROM public.invite_tokens it
  WHERE it.token = p_token
  LIMIT 1;
$$;

-- ============================================================
-- 9) validate_invite_for_activation
-- ============================================================
CREATE OR REPLACE FUNCTION public.validate_invite_for_activation(p_token text)
RETURNS TABLE (
  invite_id  uuid,
  role       app_role,
  driver_id  uuid,
  manager_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.invite_tokens;
BEGIN
  SELECT * INTO v FROM public.invite_tokens WHERE token = p_token LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite not found';
  END IF;
  IF NOT v.is_active THEN
    RAISE EXCEPTION 'invite disabled';
  END IF;
  IF v.activated_at IS NOT NULL THEN
    RAISE EXCEPTION 'invite already activated';
  END IF;
  invite_id  := v.id;
  role       := v.role;
  driver_id  := v.driver_id;
  manager_id := v.manager_id;
  RETURN NEXT;
END $$;

-- ============================================================
-- 10) admin_bind_invite_to_user
--     Called right after the new user signs up via the standard auth API.
--     Verifies token validity + user_id correspondence, then binds:
--       - profile (upsert)
--       - user_roles (insert)
--       - drivers/managers.user_id (if applicable)
--       - invite_tokens.activated_at + user_id
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_bind_invite_to_user(
  p_token     text,
  p_user_id   uuid,
  p_email     text,
  p_phone     text,
  p_full_name text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite       public.invite_tokens;
  v_auth_email   text;
  v_final_name   text;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user_id required'; END IF;
  IF coalesce(btrim(p_email), '') = '' THEN RAISE EXCEPTION 'email required'; END IF;

  SELECT * INTO v_invite FROM public.invite_tokens WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invite not found'; END IF;
  IF NOT v_invite.is_active THEN RAISE EXCEPTION 'invite disabled'; END IF;
  IF v_invite.activated_at IS NOT NULL THEN RAISE EXCEPTION 'invite already activated'; END IF;

  -- Verify that the user_id really exists and belongs to the same email.
  SELECT email INTO v_auth_email FROM auth.users WHERE id = p_user_id;
  IF v_auth_email IS NULL THEN
    RAISE EXCEPTION 'auth user not found';
  END IF;
  IF lower(v_auth_email) <> lower(btrim(p_email)) THEN
    RAISE EXCEPTION 'email mismatch';
  END IF;

  v_final_name := coalesce(nullif(btrim(p_full_name), ''), v_invite.full_name);

  -- Profile (insert-or-update)
  INSERT INTO public.profiles (user_id, email, full_name, phone, is_active)
  VALUES (p_user_id, lower(btrim(p_email)), v_final_name, nullif(btrim(p_phone), ''), true)
  ON CONFLICT (user_id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        phone = EXCLUDED.phone,
        is_active = true,
        updated_at = now();

  -- Role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, v_invite.role)
  ON CONFLICT DO NOTHING;

  -- Link driver / manager records if invite carries the reference
  IF v_invite.role = 'driver' AND v_invite.driver_id IS NOT NULL THEN
    UPDATE public.drivers
       SET user_id = p_user_id
     WHERE id = v_invite.driver_id AND user_id IS NULL;
  END IF;
  IF v_invite.role = 'manager' AND v_invite.manager_id IS NOT NULL THEN
    UPDATE public.managers
       SET user_id = p_user_id
     WHERE id = v_invite.manager_id AND user_id IS NULL;
  END IF;

  -- Mark invite as activated and bind to user
  UPDATE public.invite_tokens
     SET user_id        = p_user_id,
         activated_at   = now(),
         last_used_at   = now(),
         activated_email = lower(btrim(p_email)),
         full_name      = v_final_name,
         phone          = coalesce(nullif(btrim(p_phone), ''), phone),
         updated_at     = now()
   WHERE id = v_invite.id;

  RETURN jsonb_build_object(
    'invite_id', v_invite.id,
    'user_id',   p_user_id,
    'role',      v_invite.role
  );
END $$;

-- ============================================================
-- 11) Grants
-- ============================================================
REVOKE ALL ON FUNCTION public.admin_issue_invite(text,text,app_role,text,uuid,text)   FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_rotate_invite(uuid)                                FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_invite_active(uuid, boolean)                   FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_invite(uuid)                                FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_invite_public(text)                                  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_invite_for_activation(text)                     FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_bind_invite_to_user(text, uuid, text, text, text)  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_issue_invite(text,text,app_role,text,uuid,text)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_rotate_invite(uuid)                              TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_invite_active(uuid, boolean)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_invite(uuid)                              TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_invite_public(text)                  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_invite_for_activation(text)     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_bind_invite_to_user(text, uuid, text, text, text) TO anon, authenticated;
