CREATE OR REPLACE FUNCTION public.admin_bind_invite_to_user(
  p_token text, p_user_id uuid, p_email text, p_phone text, p_full_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller     uuid := auth.uid();
  v_invite     public.invite_tokens;
  v_auth_email text;
  v_final_name text;
BEGIN
  -- 1) Привязывать invite может только сам зарегистрированный пользователь.
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL OR p_user_id <> v_caller THEN
    RAISE EXCEPTION 'forbidden: can only bind invite to your own account'
      USING ERRCODE = '42501';
  END IF;
  IF coalesce(btrim(p_email), '') = '' THEN
    RAISE EXCEPTION 'email required';
  END IF;

  -- 2) Сверяем email именно для auth.uid(), а не для произвольного user_id.
  SELECT email INTO v_auth_email FROM auth.users WHERE id = v_caller;
  IF v_auth_email IS NULL THEN
    RAISE EXCEPTION 'auth user not found';
  END IF;
  IF lower(v_auth_email) <> lower(btrim(p_email)) THEN
    RAISE EXCEPTION 'email mismatch';
  END IF;

  -- 3) Проверки invite.
  SELECT * INTO v_invite FROM public.invite_tokens
   WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invite not found'; END IF;
  IF NOT v_invite.is_active THEN RAISE EXCEPTION 'invite disabled'; END IF;
  IF v_invite.activated_at IS NOT NULL THEN RAISE EXCEPTION 'invite already activated'; END IF;

  v_final_name := coalesce(nullif(btrim(p_full_name), ''), v_invite.full_name);

  INSERT INTO public.profiles (user_id, email, full_name, phone, is_active)
  VALUES (v_caller, lower(btrim(p_email)), v_final_name, nullif(btrim(p_phone), ''), true)
  ON CONFLICT (user_id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        phone = EXCLUDED.phone,
        is_active = true,
        updated_at = now();

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_caller, v_invite.role)
  ON CONFLICT DO NOTHING;

  IF v_invite.role = 'driver' AND v_invite.driver_id IS NOT NULL THEN
    UPDATE public.drivers SET user_id = v_caller
     WHERE id = v_invite.driver_id AND user_id IS NULL;
  END IF;
  IF v_invite.role = 'manager' AND v_invite.manager_id IS NOT NULL THEN
    UPDATE public.managers SET user_id = v_caller
     WHERE id = v_invite.manager_id AND user_id IS NULL;
  END IF;

  UPDATE public.invite_tokens
     SET user_id         = v_caller,
         activated_at    = now(),
         last_used_at    = now(),
         activated_email = lower(btrim(p_email)),
         full_name       = v_final_name,
         phone           = coalesce(nullif(btrim(p_phone), ''), phone),
         updated_at      = now()
   WHERE id = v_invite.id;

  RETURN jsonb_build_object(
    'invite_id', v_invite.id,
    'user_id',   v_caller,
    'role',      v_invite.role
  );
END
$function$;

-- Отзываем доступ у anon — теперь bind возможен только с сессией.
REVOKE ALL ON FUNCTION public.admin_bind_invite_to_user(text, uuid, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_bind_invite_to_user(text, uuid, text, text, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.admin_bind_invite_to_user(text, uuid, text, text, text) TO authenticated;