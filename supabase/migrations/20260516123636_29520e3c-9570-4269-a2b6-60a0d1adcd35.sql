-- Hotfix: get_orders_for_portal_token returned order_status enum,
-- but public.orders.status is text in production with a wider set of values.
-- Drop and recreate with status text to unblock migration 20260516101848.

DROP FUNCTION IF EXISTS public.get_orders_for_portal_token(text);

CREATE OR REPLACE FUNCTION public.get_orders_for_portal_token(_token text)
RETURNS TABLE (
  id uuid,
  order_number text,
  status text,
  created_at timestamptz,
  delivery_address text,
  delivery_window_from time,
  delivery_window_to time,
  delivery_time_comment text,
  recipient_delivery_comment text,
  recipient_access_comment text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.id,
    o.order_number,
    o.status::text,
    o.created_at,
    o.delivery_address,
    o.delivery_window_from,
    o.delivery_window_to,
    o.delivery_time_comment,
    o.recipient_delivery_comment,
    o.recipient_access_comment
  FROM public.orders o
  JOIN public.clients c ON c.id = o.client_id
  WHERE c.portal_token = _token
    AND c.portal_access_enabled = true
    AND c.portal_token_revoked_at IS NULL
  ORDER BY o.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_orders_for_portal_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_orders_for_portal_token(text) TO anon, authenticated;