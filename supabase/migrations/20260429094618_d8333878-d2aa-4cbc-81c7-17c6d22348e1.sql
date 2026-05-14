CREATE TABLE IF NOT EXISTS public.warehouse_load_plan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_point_id UUID NOT NULL UNIQUE,
  delivery_route_id UUID NOT NULL,
  cargo_position TEXT,
  -- side, top, bottom, deep, left, right, return_trip
  warehouse_comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.warehouse_load_plan ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view warehouse_load_plan" ON public.warehouse_load_plan FOR SELECT USING (true);
CREATE POLICY "Anyone can insert warehouse_load_plan" ON public.warehouse_load_plan FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update warehouse_load_plan" ON public.warehouse_load_plan FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete warehouse_load_plan" ON public.warehouse_load_plan FOR DELETE USING (true);

CREATE INDEX IF NOT EXISTS idx_wlp_route ON public.warehouse_load_plan(delivery_route_id);

CREATE TRIGGER wlp_set_updated_at
BEFORE UPDATE ON public.warehouse_load_plan
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.warehouse_dock_events
ADD COLUMN IF NOT EXISTS load_plan_confirmed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS load_plan_confirmed_by TEXT;