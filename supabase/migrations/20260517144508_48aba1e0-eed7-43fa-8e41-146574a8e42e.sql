REVOKE ALL ON FUNCTION public.admin_delete_delivery_route(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_delivery_route(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.admin_delete_delivery_route(uuid) FROM service_role;
REVOKE ALL ON FUNCTION public.admin_delete_delivery_route(uuid) FROM sandbox_exec;
GRANT EXECUTE ON FUNCTION public.admin_delete_delivery_route(uuid) TO authenticated;