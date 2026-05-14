-- 1) Add 'carrier' to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'carrier';

-- 2) Link profiles to a carrier company (for carrier-role users)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS carrier_id UUID REFERENCES public.carriers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_carrier_id ON public.profiles(carrier_id);

-- 3) Create route_offers table
CREATE TABLE IF NOT EXISTS public.route_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID REFERENCES public.routes(id) ON DELETE CASCADE,
  transport_request_id UUID,
  carrier_id UUID NOT NULL REFERENCES public.carriers(id) ON DELETE CASCADE,
  vehicle_id UUID,
  driver_id UUID,
  status TEXT NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent','viewed','accepted','declined','expired')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  viewed_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  decline_reason TEXT,
  comment TEXT,
  company_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_route_offers_carrier ON public.route_offers(carrier_id, status);
CREATE INDEX IF NOT EXISTS idx_route_offers_route ON public.route_offers(route_id);
CREATE INDEX IF NOT EXISTS idx_route_offers_status ON public.route_offers(status, sent_at DESC);

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_route_offers_updated_at ON public.route_offers;
CREATE TRIGGER trg_route_offers_updated_at
  BEFORE UPDATE ON public.route_offers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) RLS
ALTER TABLE public.route_offers ENABLE ROW LEVEL SECURITY;

-- Admin/director/logist: full access
DROP POLICY IF EXISTS route_offers_staff_all ON public.route_offers;
CREATE POLICY route_offers_staff_all ON public.route_offers
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

-- Carrier: SELECT own offers
DROP POLICY IF EXISTS route_offers_carrier_select ON public.route_offers;
CREATE POLICY route_offers_carrier_select ON public.route_offers
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.carrier_id = route_offers.carrier_id
    )
  );

-- Carrier: UPDATE own offers (accept/decline/viewed)
DROP POLICY IF EXISTS route_offers_carrier_update ON public.route_offers
;
CREATE POLICY route_offers_carrier_update ON public.route_offers
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.carrier_id = route_offers.carrier_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.carrier_id = route_offers.carrier_id
    )
  );
