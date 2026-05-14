ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS delivery_percent_target numeric NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS manual_orders_amount numeric;