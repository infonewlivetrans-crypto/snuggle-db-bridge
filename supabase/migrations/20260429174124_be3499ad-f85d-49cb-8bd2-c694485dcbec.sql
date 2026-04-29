ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS points_order_changed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS points_order_changed_by text;