DROP FUNCTION IF EXISTS public.get_order_by_recipient_token(text);

ALTER TABLE public.orders
  DROP COLUMN IF EXISTS recipient_access_token,
  DROP COLUMN IF EXISTS recipient_access_enabled,
  DROP COLUMN IF EXISTS recipient_access_created_at,
  DROP COLUMN IF EXISTS recipient_access_revoked_at;