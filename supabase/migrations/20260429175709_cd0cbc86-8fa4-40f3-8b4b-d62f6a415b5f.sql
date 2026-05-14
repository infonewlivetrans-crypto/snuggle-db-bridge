
-- Add delivery cost calculation fields to routes
ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS cost_method text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS cost_per_km numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_per_point numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fixed_cost numeric NOT NULL DEFAULT 0;

ALTER TABLE public.routes
  DROP CONSTRAINT IF EXISTS routes_cost_method_check;
ALTER TABLE public.routes
  ADD CONSTRAINT routes_cost_method_check
  CHECK (cost_method IN ('manual','per_km','per_point','km_plus_point'));
