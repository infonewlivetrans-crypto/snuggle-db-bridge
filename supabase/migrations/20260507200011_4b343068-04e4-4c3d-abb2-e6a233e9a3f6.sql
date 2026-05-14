ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS driver_comment text,
  ADD COLUMN IF NOT EXISTS driver_comment_is_important boolean NOT NULL DEFAULT false;