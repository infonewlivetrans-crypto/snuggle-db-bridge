-- 1. Добавляем carrier_id в delivery_routes
ALTER TABLE public.delivery_routes
  ADD COLUMN IF NOT EXISTS carrier_id uuid REFERENCES public.carriers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_delivery_routes_carrier_id ON public.delivery_routes(carrier_id);

-- 2. Триггер: при подтверждении перевозчика на routes → синхронизируем delivery_routes
CREATE OR REPLACE FUNCTION public.sync_delivery_route_on_carrier_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver_name TEXT;
  v_vehicle_label TEXT;
BEGIN
  -- срабатываем только при переходе в 'assigned'
  IF NEW.carrier_assignment_status IS DISTINCT FROM 'assigned'
     OR (TG_OP = 'UPDATE' AND OLD.carrier_assignment_status = 'assigned') THEN
    -- проверим оба условия отдельно
    IF NEW.carrier_assignment_status <> 'assigned' THEN
      RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.carrier_assignment_status = 'assigned' THEN
      RETURN NEW;
    END IF;
  END IF;

  -- получаем читаемые данные водителя и машины
  SELECT full_name INTO v_driver_name FROM public.drivers WHERE id = NEW.driver_id;
  SELECT COALESCE(brand_model || ' ' || plate_number, plate_number)
    INTO v_vehicle_label
    FROM public.vehicles WHERE id = NEW.vehicle_id;

  -- обновляем все связанные delivery_routes
  UPDATE public.delivery_routes
     SET carrier_id = NEW.carrier_id,
         assigned_driver = COALESCE(v_driver_name, assigned_driver),
         assigned_vehicle = COALESCE(v_vehicle_label, assigned_vehicle),
         status = CASE WHEN status = 'formed' THEN 'issued'::delivery_route_status ELSE status END,
         driver_access_enabled = true,
         updated_at = now()
   WHERE source_request_id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_delivery_route_on_carrier_assigned ON public.routes;
CREATE TRIGGER trg_sync_delivery_route_on_carrier_assigned
  AFTER UPDATE OF carrier_assignment_status, carrier_id, driver_id, vehicle_id
  ON public.routes
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_delivery_route_on_carrier_assigned();

-- 3. RLS: перевозчик видит свои delivery_routes
DROP POLICY IF EXISTS delivery_routes_carrier_select ON public.delivery_routes;
CREATE POLICY delivery_routes_carrier_select ON public.delivery_routes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.carrier_id IS NOT NULL
        AND p.carrier_id = delivery_routes.carrier_id
    )
  );

-- 4. RLS: перевозчик видит точки маршрута своих delivery_routes
DROP POLICY IF EXISTS route_points_carrier_select ON public.route_points;
CREATE POLICY route_points_carrier_select ON public.route_points
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.delivery_routes dr
      JOIN public.profiles p ON p.user_id = auth.uid()
      WHERE dr.source_request_id = route_points.route_id
        AND p.carrier_id IS NOT NULL
        AND p.carrier_id = dr.carrier_id
    )
  );

-- 5. RLS: перевозчик видит заказы (orders) своих рейсов
DROP POLICY IF EXISTS orders_carrier_select ON public.orders;
CREATE POLICY orders_carrier_select ON public.orders
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.route_points rp
      JOIN public.delivery_routes dr ON dr.source_request_id = rp.route_id
      JOIN public.profiles p ON p.user_id = auth.uid()
      WHERE rp.order_id = orders.id
        AND p.carrier_id IS NOT NULL
        AND p.carrier_id = dr.carrier_id
    )
  );

-- 6. RLS: перевозчик может ОБНОВЛЯТЬ статусы точек своих рейсов (как водитель)
DROP POLICY IF EXISTS route_points_carrier_update ON public.route_points;
CREATE POLICY route_points_carrier_update ON public.route_points
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.delivery_routes dr
      JOIN public.profiles p ON p.user_id = auth.uid()
      WHERE dr.source_request_id = route_points.route_id
        AND p.carrier_id IS NOT NULL
        AND p.carrier_id = dr.carrier_id
    )
  );

-- 7. RLS: перевозчик может обновлять статусы delivery_routes (в пути / завершён)
DROP POLICY IF EXISTS delivery_routes_carrier_update ON public.delivery_routes;
CREATE POLICY delivery_routes_carrier_update ON public.delivery_routes
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.carrier_id IS NOT NULL
        AND p.carrier_id = delivery_routes.carrier_id
    )
  );