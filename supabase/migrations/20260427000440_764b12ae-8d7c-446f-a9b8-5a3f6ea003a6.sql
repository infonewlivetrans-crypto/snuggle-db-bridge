-- 1) Склады
CREATE TABLE IF NOT EXISTS public.warehouses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  phone TEXT,
  contact_person TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view warehouses" ON public.warehouses FOR SELECT USING (true);
CREATE POLICY "Anyone can insert warehouses" ON public.warehouses FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update warehouses" ON public.warehouses FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete warehouses" ON public.warehouses FOR DELETE USING (true);

CREATE TRIGGER trg_warehouses_updated_at
BEFORE UPDATE ON public.warehouses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) routes: ссылки на склад / водителя / авто
ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS driver_id    UUID REFERENCES public.drivers(id)    ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vehicle_id   UUID REFERENCES public.vehicles(id)   ON DELETE SET NULL;

-- driver_name делаем nullable: остаётся для совместимости, но новые маршруты могут опираться на driver_id
ALTER TABLE public.routes ALTER COLUMN driver_name DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_routes_warehouse ON public.routes(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_routes_driver    ON public.routes(driver_id);
CREATE INDEX IF NOT EXISTS idx_routes_vehicle   ON public.routes(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_route_points_route ON public.route_points(route_id);
CREATE INDEX IF NOT EXISTS idx_route_points_order ON public.route_points(order_id);

-- 3) Триггер: при смене статуса точки — обновить заказ и записать отчёт
CREATE OR REPLACE FUNCTION public.sync_order_from_route_point()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_outcome TEXT;
  v_new_order_status order_status;
  v_requires_resend BOOLEAN := false;
  v_route RECORD;
  v_driver_name TEXT;
  v_now TIMESTAMPTZ := now();
BEGIN
  -- Проставляем системные времена
  IF NEW.status = 'arrived' AND NEW.arrived_at IS NULL THEN
    NEW.arrived_at := v_now;
  END IF;

  -- Сопоставление статуса точки → итог
  IF NEW.status = 'completed' THEN
    v_outcome := 'delivered';
    v_new_order_status := 'delivered';
  ELSIF NEW.status = 'defective' THEN
    v_outcome := 'defective';
    v_new_order_status := 'awaiting_resend';
    v_requires_resend := true;
  ELSIF NEW.status = 'returned_to_warehouse' THEN
    v_outcome := 'not_delivered';
    v_new_order_status := 'awaiting_resend';
    v_requires_resend := true;
  ELSIF NEW.status IN ('failed','no_payment','no_qr','client_no_answer','client_absent','client_refused','no_unloading','problem') THEN
    v_outcome := 'not_delivered';
    v_new_order_status := 'not_delivered';
  ELSE
    v_outcome := NULL;
  END IF;

  IF v_outcome IS NOT NULL AND NEW.completed_at IS NULL THEN
    NEW.completed_at := v_now;
  END IF;

  -- Если статус не изменился — выходим (только времена обновили выше)
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Загружаем маршрут (для имени водителя)
  SELECT r.driver_name, d.full_name AS dr_full_name
    INTO v_route
  FROM public.routes r
  LEFT JOIN public.drivers d ON d.id = r.driver_id
  WHERE r.id = NEW.route_id;
  v_driver_name := COALESCE(v_route.dr_full_name, v_route.driver_name);

  -- Применяем статус заказа
  IF v_outcome IS NOT NULL THEN
    UPDATE public.orders
       SET status = v_new_order_status,
           updated_at = v_now
     WHERE id = NEW.order_id;

    -- Пишем отчёт
    INSERT INTO public.delivery_reports
      (order_id, route_id, route_point_id, outcome, reason, driver_name, requires_resend, delivered_at)
    VALUES
      (NEW.order_id, NEW.route_id, NEW.id, v_outcome, NEW.status::text, v_driver_name, v_requires_resend, v_now);
  ELSIF NEW.status = 'arrived' THEN
    -- Точка отмечена как «прибыл» → заказ переходит в «доставляется»
    UPDATE public.orders
       SET status = CASE WHEN status IN ('new','in_progress') THEN 'delivering'::order_status ELSE status END,
           updated_at = v_now
     WHERE id = NEW.order_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_route_points_sync ON public.route_points;
CREATE TRIGGER trg_route_points_sync
BEFORE INSERT OR UPDATE OF status ON public.route_points
FOR EACH ROW EXECUTE FUNCTION public.sync_order_from_route_point();

-- При добавлении точки в маршрут → заказ становится «в работе»
CREATE OR REPLACE FUNCTION public.set_order_in_progress_on_point_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.orders
     SET status = 'in_progress'::order_status,
         updated_at = now()
   WHERE id = NEW.order_id
     AND status = 'new';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_route_points_in_progress ON public.route_points;
CREATE TRIGGER trg_route_points_in_progress
AFTER INSERT ON public.route_points
FOR EACH ROW EXECUTE FUNCTION public.set_order_in_progress_on_point_insert();