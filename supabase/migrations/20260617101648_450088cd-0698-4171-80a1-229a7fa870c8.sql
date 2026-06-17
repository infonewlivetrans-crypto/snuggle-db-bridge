
ALTER TABLE public.dispatcher_carrier_email_accounts
  ADD COLUMN IF NOT EXISTS imap_host text,
  ADD COLUMN IF NOT EXISTS imap_port integer DEFAULT 993,
  ADD COLUMN IF NOT EXISTS imap_secure boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS imap_user text,
  ADD COLUMN IF NOT EXISTS imap_password_encrypted text,
  ADD COLUMN IF NOT EXISTS last_inbox_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_inbox_uid bigint;

CREATE TABLE IF NOT EXISTS public.dispatcher_inbound_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_ext_id uuid NOT NULL REFERENCES public.dispatcher_carrier_ext(id) ON DELETE CASCADE,
  dispatcher_deal_id uuid REFERENCES public.dispatcher_deals(id) ON DELETE SET NULL,
  dispatcher_freight_id uuid REFERENCES public.dispatcher_freights(id) ON DELETE SET NULL,
  dispatcher_trip_id uuid REFERENCES public.dispatcher_trips(id) ON DELETE SET NULL,
  email_message_id text,
  email_from text,
  email_subject text,
  email_date timestamptz,
  attachment_filename text,
  attachment_mime_type text,
  attachment_size integer,
  attachment_hash text,
  storage_bucket text DEFAULT 'inbound-documents',
  storage_path text,
  document_kind text DEFAULT 'other',
  processing_status text NOT NULL DEFAULT 'new',
  extracted_text text,
  parsed_payload jsonb,
  parse_confidence numeric,
  parse_warnings text[],
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS dispatcher_inbound_documents_dedup_idx
  ON public.dispatcher_inbound_documents (carrier_ext_id, email_message_id, attachment_hash)
  WHERE email_message_id IS NOT NULL AND attachment_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS dispatcher_inbound_documents_carrier_idx
  ON public.dispatcher_inbound_documents (carrier_ext_id, created_at DESC);
CREATE INDEX IF NOT EXISTS dispatcher_inbound_documents_status_idx
  ON public.dispatcher_inbound_documents (processing_status);
CREATE INDEX IF NOT EXISTS dispatcher_inbound_documents_trip_idx
  ON public.dispatcher_inbound_documents (dispatcher_trip_id) WHERE dispatcher_trip_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispatcher_inbound_documents TO authenticated;
GRANT ALL ON public.dispatcher_inbound_documents TO service_role;

ALTER TABLE public.dispatcher_inbound_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inbound_docs_admin_all ON public.dispatcher_inbound_documents;
CREATE POLICY inbound_docs_admin_all ON public.dispatcher_inbound_documents
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher'));

DROP POLICY IF EXISTS inbound_docs_carrier_read ON public.dispatcher_inbound_documents;
CREATE POLICY inbound_docs_carrier_read ON public.dispatcher_inbound_documents
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.dispatcher_carrier_users dcu
      WHERE dcu.dispatcher_carrier_ext_id = dispatcher_inbound_documents.carrier_ext_id
        AND dcu.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS inbound_docs_driver_read ON public.dispatcher_inbound_documents;
CREATE POLICY inbound_docs_driver_read ON public.dispatcher_inbound_documents
  FOR SELECT TO authenticated
  USING (
    dispatcher_trip_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.dispatcher_trips t
      JOIN public.dispatcher_driver_ext de ON de.id = t.driver_ext_id
      WHERE t.id = dispatcher_inbound_documents.dispatcher_trip_id
        AND de.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.tg_inbound_docs_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS dispatcher_inbound_documents_updated_at ON public.dispatcher_inbound_documents;
CREATE TRIGGER dispatcher_inbound_documents_updated_at
  BEFORE UPDATE ON public.dispatcher_inbound_documents
  FOR EACH ROW EXECUTE FUNCTION public.tg_inbound_docs_set_updated_at();

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.dispatcher_inbound_documents;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END$$;
