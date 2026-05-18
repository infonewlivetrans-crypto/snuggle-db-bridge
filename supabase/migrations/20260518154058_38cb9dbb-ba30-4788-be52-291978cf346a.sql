-- Re-declare public.has_any_admin() to ensure it is present in the PostgREST
-- schema cache after deploy. Logic is unchanged.
CREATE OR REPLACE FUNCTION public.has_any_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.has_any_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_any_admin() TO anon, authenticated, service_role;

-- Force PostgREST to reload the schema cache so the function is visible to
-- any PostgREST instance connected to this database (including the one used
-- by the VPS runtime).
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';