
ALTER TABLE public.delivery_routes
  ADD COLUMN IF NOT EXISTS assigned_driver TEXT,
  ADD COLUMN IF NOT EXISTS assigned_vehicle TEXT;
