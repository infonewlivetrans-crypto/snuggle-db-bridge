ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS recipient_access_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS recipient_access_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS recipient_access_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS recipient_access_revoked_at timestamptz;

CREATE OR REPLACE FUNCTION public.get_order_by_recipient_token(_token text)
RETURNS TABLE(
  order_number text,
  status order_status,
  delivery_address text,
  delivery_window_from time without time zone,
  delivery_window_to time without time zone,
  delivery_time_comment text,
  recipient_delivery_comment text,
  recipient_access_comment text,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.order_number,
    o.status,
    o.delivery_address,
    o.delivery_window_from,
    o.delivery_window_to,
    o.delivery_time_comment,
    o.recipient_delivery_comment,
    o.recipient_access_comment,
    o.updated_at
  FROM public.orders o
  WHERE o.recipient_access_token = _token
    AND o.recipient_access_enabled = true
    AND o.recipient_access_revoked_at IS NULL
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_order_by_recipient_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_by_recipient_token(text) TO anon, authenticated;