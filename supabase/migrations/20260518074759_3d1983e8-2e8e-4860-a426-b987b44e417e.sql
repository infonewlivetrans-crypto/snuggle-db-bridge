CREATE OR REPLACE FUNCTION public.get_driver_access_route_by_token(p_token text)
RETURNS TABLE (id uuid, driver_access_enabled boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_token IS NULL THEN
    RETURN;
  END IF;
  IF length(p_token) < 8 OR length(p_token) > 128 THEN
    RETURN;
  END IF;
  IF p_token !~ '^[a-zA-Z0-9_-]+$' THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT dr.id, COALESCE(dr.driver_access_enabled, false) AS driver_access_enabled
    FROM public.delivery_routes dr
    WHERE dr.driver_access_token = p_token
    LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_driver_access_route_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_driver_access_route_by_token(text) TO anon, authenticated;