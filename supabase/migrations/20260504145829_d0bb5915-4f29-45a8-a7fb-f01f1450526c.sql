-- 1. Enum value: excluded_from_route
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'excluded_from_route';

-- 2. Audit table
CREATE TABLE IF NOT EXISTS public.route_order_exclusions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_route_id uuid NOT NULL REFERENCES public.delivery_routes(id) ON DELETE CASCADE,
  route_id uuid REFERENCES public.routes(id) ON DELETE SET NULL,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  reason text NOT NULL,
  comment text,
  excluded_by uuid,
  excluded_by_name text,
  excluded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS route_order_exclusions_dr_idx
  ON public.route_order_exclusions(delivery_route_id);
CREATE INDEX IF NOT EXISTS route_order_exclusions_order_idx
  ON public.route_order_exclusions(order_id);

ALTER TABLE public.route_order_exclusions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS route_order_exclusions_select_auth ON public.route_order_exclusions;
CREATE POLICY route_order_exclusions_select_auth
  ON public.route_order_exclusions FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS route_order_exclusions_insert_admin ON public.route_order_exclusions;
CREATE POLICY route_order_exclusions_insert_admin
  ON public.route_order_exclusions FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 3. Trigger: create a notification for the manager when an exclusion is recorded
CREATE OR REPLACE FUNCTION public.notify_on_order_excluded_from_route()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_number text;
  v_manager text;
  v_contact text;
  v_route_number text;
BEGIN
  SELECT o.order_number, o.contact_name INTO v_order_number, v_contact
    FROM public.orders o WHERE o.id = NEW.order_id;

  SELECT manager_name INTO v_manager
    FROM public.clients
   WHERE name = v_contact
   LIMIT 1;

  SELECT route_number INTO v_route_number
    FROM public.delivery_routes WHERE id = NEW.delivery_route_id;

  INSERT INTO public.notifications (kind, title, body, order_id, route_id, payload)
  VALUES (
    'order_excluded_from_route',
    'Заказ убран из рейса',
    'Заказ №' || COALESCE(v_order_number, '?') ||
      ' убран из рейса ' || COALESCE(v_route_number, '?') ||
      '. Причина: ' || NEW.reason ||
      COALESCE('. Комментарий: ' || NEW.comment, '') || '.',
    NEW.order_id,
    NEW.route_id,
    jsonb_build_object(
      'order_number', v_order_number,
      'route_number', v_route_number,
      'delivery_route_id', NEW.delivery_route_id,
      'reason', NEW.reason,
      'comment', NEW.comment,
      'excluded_by_name', NEW.excluded_by_name,
      'manager_name', v_manager,
      'recipients', jsonb_build_array('manager','logistician')
    )
  );

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_on_order_excluded_from_route ON public.route_order_exclusions;
CREATE TRIGGER trg_notify_on_order_excluded_from_route
  AFTER INSERT ON public.route_order_exclusions
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_order_excluded_from_route();