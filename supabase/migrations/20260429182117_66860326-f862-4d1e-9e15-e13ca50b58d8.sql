
-- История изменения стоимости доставки маршрута
CREATE TABLE IF NOT EXISTS public.route_cost_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  route_id UUID NOT NULL,
  old_cost NUMERIC NOT NULL DEFAULT 0,
  new_cost NUMERIC NOT NULL DEFAULT 0,
  old_method TEXT,
  new_method TEXT,
  changed_by TEXT,
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_route_cost_history_route ON public.route_cost_history(route_id, created_at DESC);

ALTER TABLE public.route_cost_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view route_cost_history"
  ON public.route_cost_history FOR SELECT USING (true);
CREATE POLICY "Anyone can insert route_cost_history"
  ON public.route_cost_history FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update route_cost_history"
  ON public.route_cost_history FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete route_cost_history"
  ON public.route_cost_history FOR DELETE USING (true);
