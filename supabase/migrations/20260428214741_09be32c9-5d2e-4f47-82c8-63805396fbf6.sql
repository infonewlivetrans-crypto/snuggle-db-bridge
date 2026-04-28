
-- Enum статусов маршрута доставки
DO $$ BEGIN
  CREATE TYPE public.delivery_route_status AS ENUM ('draft','formed','in_progress','completed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Функция-генератор номера маршрута
CREATE OR REPLACE FUNCTION public.generate_delivery_route_number()
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(route_number FROM 'DR-(\d+)') AS INTEGER)), 0) + 1
    INTO next_num
  FROM public.delivery_routes
  WHERE route_number ~ '^DR-\d+$';
  RETURN 'DR-' || LPAD(next_num::TEXT, 4, '0');
END $$;

-- Таблица маршрутов доставки (создаётся из заявки)
CREATE TABLE IF NOT EXISTS public.delivery_routes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  route_number TEXT NOT NULL UNIQUE,
  route_date DATE NOT NULL DEFAULT CURRENT_DATE,
  source_request_id UUID NOT NULL,
  source_warehouse_id UUID,
  status public.delivery_route_status NOT NULL DEFAULT 'formed',
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_delivery_routes_request ON public.delivery_routes(source_request_id);
CREATE INDEX IF NOT EXISTS idx_delivery_routes_date ON public.delivery_routes(route_date DESC);

ALTER TABLE public.delivery_routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view delivery_routes" ON public.delivery_routes FOR SELECT USING (true);
CREATE POLICY "Anyone can insert delivery_routes" ON public.delivery_routes FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update delivery_routes" ON public.delivery_routes FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete delivery_routes" ON public.delivery_routes FOR DELETE USING (true);

-- Триггер автономера и updated_at
CREATE OR REPLACE FUNCTION public.trg_delivery_routes_set_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.route_number IS NULL OR length(trim(NEW.route_number)) = 0 THEN
    NEW.route_number := public.generate_delivery_route_number();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS delivery_routes_set_number ON public.delivery_routes;
CREATE TRIGGER delivery_routes_set_number
  BEFORE INSERT ON public.delivery_routes
  FOR EACH ROW EXECUTE FUNCTION public.trg_delivery_routes_set_number();

DROP TRIGGER IF EXISTS delivery_routes_updated_at ON public.delivery_routes;
CREATE TRIGGER delivery_routes_updated_at
  BEFORE UPDATE ON public.delivery_routes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
