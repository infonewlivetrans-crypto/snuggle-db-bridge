
ALTER TABLE public.dispatcher_freights
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_email_from text,
  ADD COLUMN IF NOT EXISTS source_email_subject text,
  ADD COLUMN IF NOT EXISTS source_email_body text,
  ADD COLUMN IF NOT EXISTS source_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS customer_email text,
  ADD COLUMN IF NOT EXISTS customer_phone text,
  ADD COLUMN IF NOT EXISTS raw_text text,
  ADD COLUMN IF NOT EXISTS extracted_text text,
  ADD COLUMN IF NOT EXISTS parse_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS source_document_id uuid,
  ADD COLUMN IF NOT EXISTS source_document_count integer NOT NULL DEFAULT 0;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dispatcher_freights_source_type_chk'
  ) THEN
    ALTER TABLE public.dispatcher_freights
      ADD CONSTRAINT dispatcher_freights_source_type_chk
      CHECK (source_type IN ('manual','email','ati','site','messenger','other'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dispatcher_freights_parse_status_chk'
  ) THEN
    ALTER TABLE public.dispatcher_freights
      ADD CONSTRAINT dispatcher_freights_parse_status_chk
      CHECK (parse_status IN ('draft','parsed','needs_review','converted','archive'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS dispatcher_freights_source_type_idx
  ON public.dispatcher_freights(source_type);
CREATE INDEX IF NOT EXISTS dispatcher_freights_parse_status_idx
  ON public.dispatcher_freights(parse_status);

-- Расширяем owner_type для dispatcher_documents: добавляем 'freight'.
ALTER TABLE public.dispatcher_documents
  DROP CONSTRAINT IF EXISTS dispatcher_documents_owner_type_check;
ALTER TABLE public.dispatcher_documents
  ADD CONSTRAINT dispatcher_documents_owner_type_check
  CHECK (owner_type IN ('carrier','driver','vehicle','freight'));
