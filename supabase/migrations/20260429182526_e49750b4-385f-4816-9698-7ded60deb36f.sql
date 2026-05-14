
ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS applied_tariff_id UUID,
  ADD COLUMN IF NOT EXISTS manual_cost_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_routes_applied_tariff ON public.routes(applied_tariff_id);
