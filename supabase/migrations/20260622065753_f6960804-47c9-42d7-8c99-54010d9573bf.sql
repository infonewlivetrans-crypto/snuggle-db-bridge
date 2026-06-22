
ALTER TYPE public.edo_doc_status ADD VALUE IF NOT EXISTS 'ready_to_send';
ALTER TYPE public.edo_doc_status ADD VALUE IF NOT EXISTS 'sending';

ALTER TABLE public.carrier_edo_documents
  ADD COLUMN IF NOT EXISTS operator_document_id text,
  ADD COLUMN IF NOT EXISTS operator_status text,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz;
