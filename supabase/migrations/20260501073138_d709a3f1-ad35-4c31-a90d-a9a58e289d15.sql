-- 1) Carrier assignment fields on routes
ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS carrier_id UUID REFERENCES public.carriers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS carrier_assignment_status TEXT NOT NULL DEFAULT 'none'
    CHECK (carrier_assignment_status IN ('none','pending','assigned','rejected')),
  ADD COLUMN IF NOT EXISTS carrier_assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS carrier_assigned_by UUID,
  ADD COLUMN IF NOT EXISTS pending_offer_id UUID REFERENCES public.route_offers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_routes_carrier ON public.routes(carrier_id);
CREATE INDEX IF NOT EXISTS idx_routes_assignment_status ON public.routes(carrier_assignment_status);

-- 2) History table
CREATE TABLE IF NOT EXISTS public.route_carrier_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  offer_id UUID REFERENCES public.route_offers(id) ON DELETE SET NULL,
  carrier_id UUID REFERENCES public.carriers(id) ON DELETE SET NULL,
  driver_id UUID,
  vehicle_id UUID,
  action TEXT NOT NULL
    CHECK (action IN ('offer_sent','accepted_by_carrier','declined_by_carrier','confirmed_by_logist','rejected_by_logist','released')),
  actor_user_id UUID,
  actor_label TEXT,
  comment TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rch_route ON public.route_carrier_history(route_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rch_carrier ON public.route_carrier_history(carrier_id, created_at DESC);

ALTER TABLE public.route_carrier_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rch_staff_all ON public.route_carrier_history;
CREATE POLICY rch_staff_all ON public.route_carrier_history
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'director')
    OR public.has_role(auth.uid(),'logist')
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'logist')
  );

DROP POLICY IF EXISTS rch_carrier_select ON public.route_carrier_history;
CREATE POLICY rch_carrier_select ON public.route_carrier_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.carrier_id = route_carrier_history.carrier_id
    )
  );

-- 3) Trigger: when a route_offer becomes 'accepted', mark the route as pending logist confirmation
CREATE OR REPLACE FUNCTION public.handle_route_offer_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'accepted' AND (OLD.status IS DISTINCT FROM 'accepted') AND NEW.route_id IS NOT NULL THEN
    UPDATE public.routes
    SET carrier_assignment_status = 'pending',
        pending_offer_id = NEW.id
    WHERE id = NEW.route_id
      AND carrier_assignment_status IN ('none','rejected');

    INSERT INTO public.route_carrier_history
      (route_id, offer_id, carrier_id, vehicle_id, driver_id, action, comment)
    VALUES
      (NEW.route_id, NEW.id, NEW.carrier_id, NEW.vehicle_id, NEW.driver_id,
       'accepted_by_carrier', NEW.comment);
  END IF;

  IF NEW.status = 'declined' AND (OLD.status IS DISTINCT FROM 'declined') AND NEW.route_id IS NOT NULL THEN
    INSERT INTO public.route_carrier_history
      (route_id, offer_id, carrier_id, vehicle_id, driver_id, action, reason)
    VALUES
      (NEW.route_id, NEW.id, NEW.carrier_id, NEW.vehicle_id, NEW.driver_id,
       'declined_by_carrier', NEW.decline_reason);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_route_offer_status_change ON public.route_offers;
CREATE TRIGGER trg_route_offer_status_change
  AFTER UPDATE ON public.route_offers
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.handle_route_offer_status_change();
