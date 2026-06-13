
-- Безопасный invite-flow для приглашения новых диспетчеров.
-- Не требует SUPABASE_SERVICE_ROLE_KEY на VPS — все привилегированные
-- операции выполняются через SECURITY DEFINER RPC с проверкой роли.

CREATE TABLE IF NOT EXISTS public.dispatcher_user_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT,
  comment TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  activated_at TIMESTAMPTZ,
  activated_user_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispatcher_user_invites TO authenticated;
GRANT ALL ON public.dispatcher_user_invites TO service_role;

ALTER TABLE public.dispatcher_user_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dispatcher_user_invites admin read" ON public.dispatcher_user_invites;
CREATE POLICY "dispatcher_user_invites admin read"
  ON public.dispatcher_user_invites
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "dispatcher_user_invites admin write" ON public.dispatcher_user_invites;
CREATE POLICY "dispatcher_user_invites admin write"
  ON public.dispatcher_user_invites
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS dispatcher_user_invites_set_updated_at ON public.dispatcher_user_invites;
CREATE TRIGGER dispatcher_user_invites_set_updated_at
  BEFORE UPDATE ON public.dispatcher_user_invites
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== RPC =====

CREATE OR REPLACE FUNCTION public.admin_issue_dispatcher_user_invite(
  p_full_name TEXT,
  p_email TEXT DEFAULT NULL,
  p_comment TEXT DEFAULT NULL
)
RETURNS public.dispatcher_user_invites
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_row public.dispatcher_user_invites;
  v_token TEXT;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF NOT public.has_role(v_caller, 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_full_name IS NULL OR length(btrim(p_full_name)) = 0 THEN
    RAISE EXCEPTION 'full_name_required';
  END IF;

  v_token := encode(gen_random_bytes(24), 'hex');

  INSERT INTO public.dispatcher_user_invites (
    token, full_name, email, comment, created_by
  ) VALUES (
    v_token,
    btrim(p_full_name),
    NULLIF(btrim(coalesce(p_email,'')), ''),
    NULLIF(btrim(coalesce(p_comment,'')), ''),
    v_caller
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_issue_dispatcher_user_invite(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_issue_dispatcher_user_invite(TEXT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_revoke_dispatcher_user_invite(p_invite_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT public.has_role(v_caller, 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.dispatcher_user_invites
     SET is_active = false
   WHERE id = p_invite_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_revoke_dispatcher_user_invite(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_revoke_dispatcher_user_invite(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_dispatcher_user_invite_public(p_token TEXT)
RETURNS TABLE (full_name TEXT, email TEXT, is_active BOOLEAN, already_activated BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT i.full_name, i.email, i.is_active, (i.activated_at IS NOT NULL) AS already_activated
    FROM public.dispatcher_user_invites i
   WHERE i.token = p_token
   LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_dispatcher_user_invite_public(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dispatcher_user_invite_public(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.bind_dispatcher_invite_to_user(
  p_token TEXT,
  p_user_id UUID,
  p_email TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.dispatcher_user_invites;
BEGIN
  SELECT * INTO v_invite FROM public.dispatcher_user_invites WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invite_not_found'; END IF;
  IF NOT v_invite.is_active THEN RAISE EXCEPTION 'invite_disabled'; END IF;
  IF v_invite.activated_at IS NOT NULL THEN RAISE EXCEPTION 'invite_already_activated'; END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user_id_required'; END IF;

  -- Профиль
  INSERT INTO public.profiles (user_id, email, full_name, is_active)
  VALUES (p_user_id, p_email, v_invite.full_name, true)
  ON CONFLICT (user_id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
        is_active = true;

  -- Роль dispatcher
  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, 'dispatcher'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.dispatcher_user_invites
     SET activated_at = now(),
         activated_user_id = p_user_id,
         is_active = false
   WHERE id = v_invite.id;
END;
$$;

REVOKE ALL ON FUNCTION public.bind_dispatcher_invite_to_user(TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bind_dispatcher_invite_to_user(TEXT, UUID, TEXT) TO anon, authenticated;
