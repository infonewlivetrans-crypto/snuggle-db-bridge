
CREATE TABLE IF NOT EXISTS public.carrier_account_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  dispatcher_carrier_ext_id uuid NOT NULL REFERENCES public.dispatcher_carrier_ext(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  used_at timestamptz,
  used_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.carrier_account_links TO authenticated;
GRANT ALL ON public.carrier_account_links TO service_role;

ALTER TABLE public.carrier_account_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "carrier_account_links admin/dispatcher manage"
  ON public.carrier_account_links
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher'));

CREATE INDEX IF NOT EXISTS carrier_account_links_ext_idx
  ON public.carrier_account_links(dispatcher_carrier_ext_id);

CREATE OR REPLACE FUNCTION public.get_carrier_account_link(_token text)
RETURNS TABLE(
  ext_id uuid,
  carrier_name text,
  expires_at timestamptz,
  used boolean,
  revoked boolean,
  expired boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.dispatcher_carrier_ext_id AS ext_id,
    COALESCE(c.company_name, '') AS carrier_name,
    l.expires_at,
    (l.used_at IS NOT NULL) AS used,
    (l.revoked_at IS NOT NULL) AS revoked,
    (l.expires_at < now()) AS expired
  FROM public.carrier_account_links l
  LEFT JOIN public.dispatcher_carrier_ext ext ON ext.id = l.dispatcher_carrier_ext_id
  LEFT JOIN public.carriers c ON c.id = ext.carrier_id
  WHERE l.token = _token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_carrier_account_link(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_carrier_account_link(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link public.carrier_account_links%ROWTYPE;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_link FROM public.carrier_account_links
    WHERE token = _token
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_token';
  END IF;
  IF v_link.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'revoked_token';
  END IF;
  IF v_link.expires_at < now() THEN
    RAISE EXCEPTION 'expired_token';
  END IF;
  IF v_link.used_at IS NOT NULL AND v_link.used_by IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'token_used';
  END IF;

  INSERT INTO public.user_roles(user_id, role)
  VALUES (v_uid, 'carrier'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.dispatcher_carrier_users
    SET status = 'blocked'
    WHERE status = 'active'
      AND (user_id = v_uid OR dispatcher_carrier_ext_id = v_link.dispatcher_carrier_ext_id);

  INSERT INTO public.dispatcher_carrier_users(
    dispatcher_carrier_ext_id, user_id, status, created_by
  ) VALUES (
    v_link.dispatcher_carrier_ext_id, v_uid, 'active', v_link.created_by
  );

  UPDATE public.carrier_account_links
    SET used_at = now(), used_by = v_uid
    WHERE id = v_link.id;

  RETURN jsonb_build_object(
    'ok', true,
    'ext_id', v_link.dispatcher_carrier_ext_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_carrier_account_link(text) TO authenticated;
