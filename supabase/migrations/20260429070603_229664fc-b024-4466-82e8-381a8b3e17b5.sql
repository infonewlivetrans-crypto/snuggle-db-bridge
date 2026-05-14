-- Update QR upload notification to follow required wording and include
-- manager + route + driver context so it can be routed to the assigned manager
-- and open the order card on click.

CREATE OR REPLACE FUNCTION public.notify_on_qr_upload()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_manager TEXT;
  v_route_id UUID;
  v_route_number TEXT;
  v_driver_name TEXT;
BEGIN
  IF (OLD.qr_photo_url IS NULL OR OLD.qr_photo_url = '')
     AND NEW.qr_photo_url IS NOT NULL AND NEW.qr_photo_url <> '' THEN

    -- Закреплённый менеджер по клиенту заказа
    SELECT manager_name INTO v_manager
      FROM public.clients
     WHERE name = NEW.contact_name
     LIMIT 1;

    -- Последний маршрут / водитель, в котором числится заказ
    SELECT r.id, r.route_number, COALESCE(d.full_name, r.driver_name)
      INTO v_route_id, v_route_number, v_driver_name
      FROM public.route_points rp
      JOIN public.routes r ON r.id = rp.route_id
 LEFT JOIN public.drivers d ON d.id = r.driver_id
     WHERE rp.order_id = NEW.id
     ORDER BY rp.created_at DESC
     LIMIT 1;

    INSERT INTO public.notifications (kind, title, body, order_id, route_id, payload)
    VALUES (
      'qr_uploaded',
      'QR-код получен',
      'По заказу №' || NEW.order_number || ' получен QR-код.',
      NEW.id,
      v_route_id,
      jsonb_build_object(
        'order_id', NEW.id,
        'order_number', NEW.order_number,
        'qr_photo_url', NEW.qr_photo_url,
        'qr_photo_uploaded_at', NEW.qr_photo_uploaded_at,
        'qr_photo_uploaded_by', NEW.qr_photo_uploaded_by,
        'manager_name', v_manager,
        'route_id', v_route_id,
        'route_number', v_route_number,
        'driver_name', v_driver_name
      )
    );
  END IF;
  RETURN NEW;
END;
$function$;