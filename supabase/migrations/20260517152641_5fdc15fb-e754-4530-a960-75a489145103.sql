-- SECURITY DEFINER RPCs для выпуска и перевыпуска invite-ссылки
-- без зависимости приложения от SUPABASE_SERVICE_ROLE_KEY на VPS.
-- Все операции с auth.users / auth.identities выполняются внутри
-- Lovable Cloud базы под привилегиями владельца функции.

CREATE OR REPLACE FUNCTION public.admin_create_invite(
  p_full_name text,
  p_phone text DEFAULT NULL,
  p_role text DEFAULT 'driver',
  p_comment text DEFAULT NULL,
  p_driver_id uuid DEFAULT NULL,
  p_manager_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_user_id uuid := gen_random_uuid();
  v_token text;
  v_password text;
  v_email text;
  v_role public.app_role;
  v_invite public.invite_tokens%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_role(v_uid, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_full_name IS NULL OR length(btrim(p_full_name)) = 0 THEN
    RAISE EXCEPTION 'full_name_required';
  END IF;
  IF p_role NOT IN ('admin','logist','manager','driver') THEN
    RAISE EXCEPTION 'invalid_role';
  END IF;
  v_role := p_role::public.app_role;

  -- URL-safe токены / пароль на основе случайных байтов
  v_token := rtrim(translate(encode(extensions.gen_random_bytes(16), 'base64'), '+/=', '-_'), '_');
  v_password := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
  v_email := lower(v_token) || '@invite.radius-track.local';

  -- 1) Скрытый Supabase auth-пользователь
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, is_super_admin
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user_id, 'authenticated', 'authenticated',
    v_email,
    extensions.crypt(v_password, extensions.gen_salt('bf')),
    now(), now(), now(),
    jsonb_build_object('provider','email','providers', jsonb_build_array('email')),
    jsonb_build_object('full_name', p_full_name, 'invite', true, 'role', p_role),
    false
  );

  -- 2) auth.identities — нужно для signInWithPassword при активации
  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
    'email', v_user_id::text,
    now(), now(), now()
  );

  -- 3) profile (на случай если триггер handle_new_user не сработает)
  INSERT INTO public.profiles (user_id, email, full_name, is_active)
  VALUES (v_user_id, v_email, btrim(p_full_name), true)
  ON CONFLICT (user_id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        is_active = true;

  -- 4) роль
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, v_role)
  ON CONFLICT DO NOTHING;

  -- 5) invite_tokens
  INSERT INTO public.invite_tokens (
    token, user_id, full_name, phone, role, comment,
    driver_id, manager_name, is_active, created_by
  ) VALUES (
    v_token, v_user_id, btrim(p_full_name), p_phone, v_role,
    NULLIF(btrim(p_comment), ''), p_driver_id,
    NULLIF(btrim(p_manager_name), ''),
    true, v_uid
  ) RETURNING * INTO v_invite;

  RETURN to_jsonb(v_invite);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_invite(text, text, text, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_create_invite(text, text, text, text, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_create_invite(text, text, text, text, uuid, text) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_rotate_invite_token(p_invite_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_user_id uuid;
  v_new_token text;
  v_new_password text;
  v_new_email text;
  v_invite public.invite_tokens%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_role(v_uid, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT user_id INTO v_user_id
    FROM public.invite_tokens
   WHERE id = p_invite_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'invite_not_found';
  END IF;

  v_new_token := rtrim(translate(encode(extensions.gen_random_bytes(16), 'base64'), '+/=', '-_'), '_');
  v_new_password := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
  v_new_email := lower(v_new_token) || '@invite.radius-track.local';

  UPDATE auth.users
     SET email = v_new_email,
         encrypted_password = extensions.crypt(v_new_password, extensions.gen_salt('bf')),
         email_confirmed_at = now(),
         updated_at = now()
   WHERE id = v_user_id;

  UPDATE auth.identities
     SET identity_data = jsonb_set(
                            jsonb_set(identity_data, '{email}', to_jsonb(v_new_email)),
                            '{email_verified}', 'true'::jsonb),
         updated_at = now()
   WHERE user_id = v_user_id AND provider = 'email';

  UPDATE public.profiles SET email = v_new_email WHERE user_id = v_user_id;

  UPDATE public.invite_tokens
     SET token = v_new_token
   WHERE id = p_invite_id
   RETURNING * INTO v_invite;

  RETURN to_jsonb(v_invite);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_rotate_invite_token(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_rotate_invite_token(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_rotate_invite_token(uuid) TO authenticated;