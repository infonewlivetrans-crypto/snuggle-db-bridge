-- Documents status enum
CREATE TYPE public.carrier_docs_status AS ENUM ('awaiting', 'uploaded', 'needs_fix', 'accepted');

-- Route fields
ALTER TABLE public.routes
  ADD COLUMN carrier_docs_status public.carrier_docs_status NOT NULL DEFAULT 'awaiting',
  ADD COLUMN carrier_docs_comment text,
  ADD COLUMN carrier_docs_uploaded_at timestamptz,
  ADD COLUMN carrier_docs_uploaded_by uuid,
  ADD COLUMN carrier_docs_accepted_at timestamptz,
  ADD COLUMN carrier_docs_accepted_by uuid,
  ADD COLUMN carrier_docs_fix_reason text;

-- Documents table
CREATE TABLE public.route_carrier_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  carrier_id uuid REFERENCES public.carriers(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('signed','waybill','qr','other')),
  file_url text NOT NULL,
  comment text,
  uploaded_by uuid,
  uploaded_by_label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rcd_route ON public.route_carrier_documents(route_id, created_at DESC);
CREATE INDEX idx_rcd_carrier ON public.route_carrier_documents(carrier_id);

ALTER TABLE public.route_carrier_documents ENABLE ROW LEVEL SECURITY;

-- Staff can see / manage all
CREATE POLICY "rcd_staff_all" ON public.route_carrier_documents
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'director'::app_role) OR has_role(auth.uid(),'logist'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'logist'::app_role));

-- Carriers can see / insert their own
CREATE POLICY "rcd_carrier_select" ON public.route_carrier_documents
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.carrier_id = route_carrier_documents.carrier_id));

CREATE POLICY "rcd_carrier_insert" ON public.route_carrier_documents
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.carrier_id = route_carrier_documents.carrier_id));

CREATE POLICY "rcd_carrier_delete" ON public.route_carrier_documents
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.carrier_id = route_carrier_documents.carrier_id));

-- Drop history check to allow new actions
ALTER TABLE public.route_carrier_history
  DROP CONSTRAINT IF EXISTS route_carrier_history_action_check;

ALTER TABLE public.route_carrier_history
  ADD CONSTRAINT route_carrier_history_action_check
  CHECK (action IN (
    'offer_sent','accepted_by_carrier','declined_by_carrier',
    'confirmed_by_logist','rejected_by_logist','released',
    'documents_uploaded','documents_accepted','documents_rejected'
  ));

-- Trigger: on docs accepted -> close route + payment to_pay
CREATE OR REPLACE FUNCTION public.trg_routes_carrier_docs_accepted()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.carrier_docs_status = 'accepted' AND COALESCE(OLD.carrier_docs_status::text,'') <> 'accepted' THEN
    NEW.status := 'completed'::route_status;
    IF NEW.carrier_payment_status <> 'to_pay'::carrier_payment_status THEN
      NEW.carrier_payment_status := 'to_pay'::carrier_payment_status;
    END IF;
    NEW.carrier_docs_accepted_at := COALESCE(NEW.carrier_docs_accepted_at, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_routes_carrier_docs_accepted ON public.routes;
CREATE TRIGGER trg_routes_carrier_docs_accepted
  BEFORE UPDATE OF carrier_docs_status ON public.routes
  FOR EACH ROW EXECUTE FUNCTION public.trg_routes_carrier_docs_accepted();

-- Storage bucket for carrier documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('carrier-documents', 'carrier-documents', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "carrier_docs_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'carrier-documents');

CREATE POLICY "carrier_docs_auth_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'carrier-documents');

CREATE POLICY "carrier_docs_auth_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'carrier-documents');