-- Fix: gen_random_bytes lives in pgcrypto extension; ensure it's installed in extensions schema
-- and reference it explicitly from carrier_create_driver_invite.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.carrier_create_driver_invite(
  p_ttl_days integer DEFAULT 30
)
RETURNS TABLE (id uuid, token text, status text, expires_at timestamptz, created_at timestamptz, carrier_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_ext_id uuid;
  v_carrier_id uuid;
  v_token text;
  v_expires timestamptz;
BEGIN
  v_ext_id := public.carrier_my_ext_id();
  IF v_ext_id IS NULL THEN
    RAISE EXCEPTION 'no_carrier_linked' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(e.carrier_id, e.id)
    INTO v_carrier_id
    FROM public.dispatcher_carrier_ext e
   WHERE e.id = v_ext_id;

  IF v_carrier_id IS NULL THEN
    RAISE EXCEPTION 'no_carrier_id' USING ERRCODE = '42501';
  END IF;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires := now() + make_interval(days => GREATEST(1, COALESCE(p_ttl_days, 30)));

  RETURN QUERY
  INSERT INTO public.carrier_invites (token, invite_type, carrier_id, status, expires_at)
  VALUES (v_token, 'driver', v_carrier_id, 'active', v_expires)
  RETURNING carrier_invites.id, carrier_invites.token, carrier_invites.status,
            carrier_invites.expires_at, carrier_invites.created_at, carrier_invites.carrier_id;
END;
$$;

REVOKE ALL ON FUNCTION public.carrier_create_driver_invite(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.carrier_create_driver_invite(integer) TO authenticated;