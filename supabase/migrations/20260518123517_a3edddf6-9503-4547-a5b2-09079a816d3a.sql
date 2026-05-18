-- Repair: PostgREST schema cache did not pick up admin_rotate_invite(uuid).
-- Re-declare the function identically (CREATE OR REPLACE) and force a schema
-- cache reload via pg_notify so PostgREST sees it without a restart.

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

REVOKE ALL ON FUNCTION public.admin_rotate_invite(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_rotate_invite(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_rotate_invite(uuid) TO authenticated;

-- Force PostgREST to reload its schema cache so the RPC becomes callable
-- immediately (resolves: "Could not find the function ... in the schema cache").
NOTIFY pgrst, 'reload schema';