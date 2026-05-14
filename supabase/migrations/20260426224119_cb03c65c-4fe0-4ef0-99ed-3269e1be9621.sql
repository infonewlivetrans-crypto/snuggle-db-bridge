-- Статусы маршрута и точки
CREATE TYPE public.route_status AS ENUM ('planned', 'in_progress', 'completed', 'cancelled');
CREATE TYPE public.point_status AS ENUM ('pending', 'arrived', 'completed', 'failed');

-- Таблица маршрутов
CREATE TABLE public.routes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  route_number TEXT NOT NULL UNIQUE,
  route_date DATE NOT NULL DEFAULT CURRENT_DATE,
  driver_name TEXT NOT NULL,
  status public.route_status NOT NULL DEFAULT 'planned',
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Таблица точек маршрута
CREATE TABLE public.route_points (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  route_id UUID NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  point_number INTEGER NOT NULL,
  status public.point_status NOT NULL DEFAULT 'pending',
  planned_time TIME,
  arrived_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(route_id, point_number),
  UNIQUE(route_id, order_id)
);

-- RLS
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view routes" ON public.routes FOR SELECT USING (true);
CREATE POLICY "Anyone can insert routes" ON public.routes FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update routes" ON public.routes FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete routes" ON public.routes FOR DELETE USING (true);

CREATE POLICY "Anyone can view route_points" ON public.route_points FOR SELECT USING (true);
CREATE POLICY "Anyone can insert route_points" ON public.route_points FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update route_points" ON public.route_points FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete route_points" ON public.route_points FOR DELETE USING (true);

-- Триггер обновления updated_at
CREATE TRIGGER update_routes_updated_at
BEFORE UPDATE ON public.routes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Индексы
CREATE INDEX idx_routes_date ON public.routes(route_date DESC);
CREATE INDEX idx_routes_status ON public.routes(status);
CREATE INDEX idx_route_points_route ON public.route_points(route_id, point_number);
CREATE INDEX idx_route_points_order ON public.route_points(order_id);

-- Функция автогенерации номера маршрута
CREATE OR REPLACE FUNCTION public.generate_route_number()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(route_number FROM 'RT-R-(\d+)') AS INTEGER)), 0) + 1
  INTO next_num
  FROM public.routes
  WHERE route_number ~ '^RT-R-\d+$';
  RETURN 'RT-R-' || LPAD(next_num::TEXT, 4, '0');
END;
$$;