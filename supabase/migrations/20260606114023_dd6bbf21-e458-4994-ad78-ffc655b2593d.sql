
-- ============================================================
-- Stage 8: dispatcher documents (carrier/driver/vehicle)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.dispatcher_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type text NOT NULL CHECK (owner_type IN ('carrier','driver','vehicle')),
  owner_id uuid NOT NULL,
  document_type text NOT NULL,
  title text,
  file_path text,
  file_name text,
  file_mime text,
  file_size bigint,
  document_status text NOT NULL DEFAULT 'uploaded'
    CHECK (document_status IN ('uploaded','checking','approved','rejected','expired','archived')),
  comment text,
  uploaded_by_type text,
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  checked_by uuid,
  checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dispatcher_documents_owner_idx
  ON public.dispatcher_documents (owner_type, owner_id);
CREATE INDEX IF NOT EXISTS dispatcher_documents_status_idx
  ON public.dispatcher_documents (document_status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispatcher_documents TO authenticated;
GRANT ALL ON public.dispatcher_documents TO service_role;

ALTER TABLE public.dispatcher_documents ENABLE ROW LEVEL SECURITY;

-- admin and dispatcher can read
CREATE POLICY "dispatcher_documents_select_admin_dispatcher"
  ON public.dispatcher_documents FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher'));

CREATE POLICY "dispatcher_documents_insert_admin_dispatcher"
  ON public.dispatcher_documents FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher'));

CREATE POLICY "dispatcher_documents_update_admin_dispatcher"
  ON public.dispatcher_documents FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher'));

CREATE POLICY "dispatcher_documents_delete_admin_dispatcher"
  ON public.dispatcher_documents FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher'));

-- updated_at trigger (reuse existing public.update_updated_at_column if exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column' AND pronamespace = 'public'::regnamespace
  ) THEN
    CREATE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $f$
    BEGIN NEW.updated_at = now(); RETURN NEW; END;
    $f$ LANGUAGE plpgsql SET search_path = public;
  END IF;
END $$;

DROP TRIGGER IF EXISTS dispatcher_documents_updated_at ON public.dispatcher_documents;
CREATE TRIGGER dispatcher_documents_updated_at
  BEFORE UPDATE ON public.dispatcher_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- storage.objects policies for bucket 'dispatcher-documents'
-- ============================================================
DROP POLICY IF EXISTS "dispatcher_documents_storage_select" ON storage.objects;
CREATE POLICY "dispatcher_documents_storage_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'dispatcher-documents'
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher'))
  );

DROP POLICY IF EXISTS "dispatcher_documents_storage_insert" ON storage.objects;
CREATE POLICY "dispatcher_documents_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'dispatcher-documents'
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher'))
  );

DROP POLICY IF EXISTS "dispatcher_documents_storage_update" ON storage.objects;
CREATE POLICY "dispatcher_documents_storage_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'dispatcher-documents'
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher'))
  );

DROP POLICY IF EXISTS "dispatcher_documents_storage_delete" ON storage.objects;
CREATE POLICY "dispatcher_documents_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'dispatcher-documents'
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher'))
  );
