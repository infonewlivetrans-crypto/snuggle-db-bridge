
ALTER TABLE public.delivery_routes
  ADD COLUMN IF NOT EXISTS driver_access_token TEXT,
  ADD COLUMN IF NOT EXISTS driver_access_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS driver_access_created_by TEXT,
  ADD COLUMN IF NOT EXISTS driver_access_enabled BOOLEAN NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_routes_driver_token
  ON public.delivery_routes(driver_access_token)
  WHERE driver_access_token IS NOT NULL;
