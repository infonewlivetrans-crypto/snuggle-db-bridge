-- Таблица: статус машины на складе на день (отгрузка/возврат)
CREATE TABLE IF NOT EXISTS public.warehouse_dock_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_route_id UUID,
  warehouse_id UUID,
  event_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'expected',
  -- expected, arrived, loading, loaded, departed, return_expected, return_accepted
  driver_name TEXT,
  vehicle_plate TEXT,
  route_number TEXT,
  comment TEXT,
  arrived_at TIMESTAMP WITH TIME ZONE,
  loading_started_at TIMESTAMP WITH TIME ZONE,
  loaded_at TIMESTAMP WITH TIME ZONE,
  departed_at TIMESTAMP WITH TIME ZONE,
  return_accepted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.warehouse_dock_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view warehouse_dock_events" ON public.warehouse_dock_events FOR SELECT USING (true);
CREATE POLICY "Anyone can insert warehouse_dock_events" ON public.warehouse_dock_events FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update warehouse_dock_events" ON public.warehouse_dock_events FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete warehouse_dock_events" ON public.warehouse_dock_events FOR DELETE USING (true);

CREATE INDEX IF NOT EXISTS idx_wde_date ON public.warehouse_dock_events(event_date);
CREATE INDEX IF NOT EXISTS idx_wde_route ON public.warehouse_dock_events(delivery_route_id);

CREATE TRIGGER wde_set_updated_at
BEFORE UPDATE ON public.warehouse_dock_events
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();