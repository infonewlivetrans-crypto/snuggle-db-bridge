
CREATE TABLE IF NOT EXISTS public.dispatcher_carrier_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatcher_carrier_ext_id uuid NOT NULL REFERENCES public.dispatcher_carrier_ext(id) ON DELETE CASCADE,
  dispatcher_driver_ext_id uuid NULL REFERENCES public.dispatcher_driver_ext(id) ON DELETE SET NULL,
  dispatcher_vehicle_ext_id uuid NULL REFERENCES public.dispatcher_vehicle_ext(id) ON DELETE SET NULL,
  dispatcher_deal_id uuid NULL REFERENCES public.dispatcher_deals(id) ON DELETE SET NULL,
  request_number text NULL,
  cargo_name text NULL,
  loading_city text NULL,
  loading_address text NULL,
  loading_date date NULL,
  unloading_city text NULL,
  unloading_address text NULL,
  unloading_date date NULL,
  customer_name text NULL,
  customer_contact text NULL,
  customer_email text NULL,
  customer_phone text NULL,
  rate_amount numeric NULL,
  rate_currency text NOT NULL DEFAULT 'RUB',
  payment_type text NULL,
  payment_delay_days integer NULL,
  commission_percent numeric NOT NULL DEFAULT 5,
  commission_amount numeric NULL,
  terms_text text NULL,
  dispatcher_comment text NULL,
  carrier_comment text NULL,
  request_status text NOT NULL DEFAULT 'draft',
  sent_by uuid NULL,
  sent_at timestamptz NULL,
  responded_by uuid NULL,
  responded_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dispatcher_carrier_requests_status_chk CHECK (
    request_status IN ('draft','sent','viewed','accepted','declined','cancelled','archive')
  ),
  CONSTRAINT dispatcher_carrier_requests_payment_type_chk CHECK (
    payment_type IS NULL OR payment_type IN ('prepayment','on_loading','on_unloading','delayed','mixed','other')
  )
);

CREATE INDEX IF NOT EXISTS idx_dcr_carrier ON public.dispatcher_carrier_requests(dispatcher_carrier_ext_id);
CREATE INDEX IF NOT EXISTS idx_dcr_deal ON public.dispatcher_carrier_requests(dispatcher_deal_id);
CREATE INDEX IF NOT EXISTS idx_dcr_status ON public.dispatcher_carrier_requests(request_status);
CREATE INDEX IF NOT EXISTS idx_dcr_created_at ON public.dispatcher_carrier_requests(created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispatcher_carrier_requests TO authenticated;
GRANT ALL ON public.dispatcher_carrier_requests TO service_role;

ALTER TABLE public.dispatcher_carrier_requests ENABLE ROW LEVEL SECURITY;

-- Админ/диспетчер: полный доступ.
CREATE POLICY "dcr admin/dispatcher all"
  ON public.dispatcher_carrier_requests
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher'));

-- Перевозчик: видит только заявки своего dispatcher_carrier_ext.
CREATE POLICY "dcr carrier read own"
  ON public.dispatcher_carrier_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.dispatcher_carrier_users dcu
      WHERE dcu.dispatcher_carrier_ext_id = dispatcher_carrier_requests.dispatcher_carrier_ext_id
        AND dcu.user_id = auth.uid()
        AND dcu.status = 'active'
    )
  );

-- Перевозчик: может обновлять только carrier_comment / статус (через API контролируется).
CREATE POLICY "dcr carrier update own"
  ON public.dispatcher_carrier_requests
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.dispatcher_carrier_users dcu
      WHERE dcu.dispatcher_carrier_ext_id = dispatcher_carrier_requests.dispatcher_carrier_ext_id
        AND dcu.user_id = auth.uid()
        AND dcu.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.dispatcher_carrier_users dcu
      WHERE dcu.dispatcher_carrier_ext_id = dispatcher_carrier_requests.dispatcher_carrier_ext_id
        AND dcu.user_id = auth.uid()
        AND dcu.status = 'active'
    )
  );

CREATE TRIGGER trg_dcr_updated_at
  BEFORE UPDATE ON public.dispatcher_carrier_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
