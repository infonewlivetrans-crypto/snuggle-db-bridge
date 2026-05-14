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
  IF NEW.carrier_assignment_status <> 'assigned' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.carrier_assignment_status = 'assigned'
     AND OLD.carrier_id IS NOT DISTINCT FROM NEW.carrier_id
     AND OLD.driver_id IS NOT DISTINCT FROM NEW.driver_id
     AND OLD.vehicle_id IS NOT DISTINCT FROM NEW.vehicle_id THEN
    RETURN NEW;
  END IF;

  SELECT full_name INTO v_driver_name FROM public.drivers WHERE id = NEW.driver_id;
  SELECT TRIM(BOTH ' ' FROM
           COALESCE(brand,'') || ' ' || COALESCE(model,'') || ' ' || COALESCE(plate_number,''))
    INTO v_vehicle_label
    FROM public.vehicles WHERE id = NEW.vehicle_id;

  UPDATE public.delivery_routes
     SET carrier_id = NEW.carrier_id,
         assigned_driver = COALESCE(NULLIF(v_driver_name,''), assigned_driver),
         assigned_vehicle = COALESCE(NULLIF(v_vehicle_label,''), assigned_vehicle),
         status = CASE WHEN status = 'formed' THEN 'issued'::delivery_route_status ELSE status END,
         driver_access_enabled = true,
         updated_at = now()
   WHERE source_request_id = NEW.id;

  RETURN NEW;
END;
$$;