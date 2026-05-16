-- 1) Add portal fields to clients
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS portal_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS portal_access_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS portal_token_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS portal_token_revoked_at timestamptz;

-- 2) Public read RPC: resolve client by portal token (safe fields only)
CREATE OR REPLACE FUNCTION public.get_client_by_portal_token(_token text)
RETURNS TABLE (id uuid, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.name
  FROM public.clients c
  WHERE c.portal_token = _token
    AND c.portal_access_enabled = true
    AND c.portal_token_revoked_at IS NULL
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_client_by_portal_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_client_by_portal_token(text) TO anon, authenticated;

-- 3) Public read RPC: orders for portal token (whitelisted fields only)
CREATE OR REPLACE FUNCTION public.get_orders_for_portal_token(_token text)
RETURNS TABLE (
  id uuid,
  order_number text,
  status order_status,
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
    o.status,
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