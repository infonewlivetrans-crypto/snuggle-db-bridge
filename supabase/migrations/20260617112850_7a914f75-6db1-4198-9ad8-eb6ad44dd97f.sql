
CREATE OR REPLACE FUNCTION public.user_belongs_to_carrier_ext(_carrier_ext_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.dispatcher_carrier_users dcu
    WHERE dcu.dispatcher_carrier_ext_id = _carrier_ext_id
      AND dcu.user_id = auth.uid()
      AND dcu.status = 'active'
  )
$$;

CREATE TABLE IF NOT EXISTS public.carrier_signature_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_ext_id uuid NOT NULL REFERENCES public.dispatcher_carrier_ext(id) ON DELETE CASCADE,
  uploaded_by uuid,
  source_file_path text,
  stamp_file_path text,
  signature_file_path text,
  stamp_bbox jsonb,
  signature_bbox jsonb,
  bg_removal jsonb,
  is_active boolean NOT NULL DEFAULT true,
  consent_confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS csa_carrier_idx ON public.carrier_signature_assets(carrier_ext_id, is_active);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.carrier_signature_assets TO authenticated;
GRANT ALL ON public.carrier_signature_assets TO service_role;
ALTER TABLE public.carrier_signature_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "csa staff all" ON public.carrier_signature_assets FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'dispatcher'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'dispatcher'));
CREATE POLICY "csa carrier select" ON public.carrier_signature_assets FOR SELECT TO authenticated
USING (public.user_belongs_to_carrier_ext(carrier_ext_id));
CREATE POLICY "csa carrier insert" ON public.carrier_signature_assets FOR INSERT TO authenticated
WITH CHECK (public.user_belongs_to_carrier_ext(carrier_ext_id));
CREATE POLICY "csa carrier update" ON public.carrier_signature_assets FOR UPDATE TO authenticated
USING (public.user_belongs_to_carrier_ext(carrier_ext_id))
WITH CHECK (public.user_belongs_to_carrier_ext(carrier_ext_id));
CREATE POLICY "csa carrier delete" ON public.carrier_signature_assets FOR DELETE TO authenticated
USING (public.user_belongs_to_carrier_ext(carrier_ext_id));

CREATE TRIGGER update_csa_updated_at BEFORE UPDATE ON public.carrier_signature_assets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.dispatcher_document_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inbound_document_id uuid REFERENCES public.dispatcher_inbound_documents(id) ON DELETE CASCADE,
  trip_id uuid REFERENCES public.dispatcher_trips(id) ON DELETE SET NULL,
  carrier_ext_id uuid NOT NULL REFERENCES public.dispatcher_carrier_ext(id) ON DELETE CASCADE,
  source_document_path text NOT NULL,
  signed_document_path text,
  manual_signed_document_path text,
  signature_asset_id uuid REFERENCES public.carrier_signature_assets(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft',
  placement jsonb,
  signed_by uuid,
  signed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dds_inbound_idx ON public.dispatcher_document_signatures(inbound_document_id);
CREATE INDEX IF NOT EXISTS dds_trip_idx ON public.dispatcher_document_signatures(trip_id);
CREATE INDEX IF NOT EXISTS dds_carrier_idx ON public.dispatcher_document_signatures(carrier_ext_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispatcher_document_signatures TO authenticated;
GRANT ALL ON public.dispatcher_document_signatures TO service_role;
ALTER TABLE public.dispatcher_document_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dds staff all" ON public.dispatcher_document_signatures FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'dispatcher'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'dispatcher'));
CREATE POLICY "dds carrier select" ON public.dispatcher_document_signatures FOR SELECT TO authenticated
USING (public.user_belongs_to_carrier_ext(carrier_ext_id));
CREATE POLICY "dds carrier insert" ON public.dispatcher_document_signatures FOR INSERT TO authenticated
WITH CHECK (public.user_belongs_to_carrier_ext(carrier_ext_id));
CREATE POLICY "dds carrier update" ON public.dispatcher_document_signatures FOR UPDATE TO authenticated
USING (public.user_belongs_to_carrier_ext(carrier_ext_id))
WITH CHECK (public.user_belongs_to_carrier_ext(carrier_ext_id));
CREATE POLICY "dds driver assigned select" ON public.dispatcher_document_signatures FOR SELECT TO authenticated
USING (
  trip_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.dispatcher_trips t
    JOIN public.dispatcher_driver_ext dde ON dde.id = t.driver_ext_id
    WHERE t.id = trip_id AND dde.user_id = auth.uid()
  )
);

CREATE TRIGGER update_dds_updated_at BEFORE UPDATE ON public.dispatcher_document_signatures
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
