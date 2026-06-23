-- Enum additions (safe, idempotent)
ALTER TYPE public.edo_provider ADD VALUE IF NOT EXISTS 'saby_tms';
ALTER TYPE public.edo_participant_role ADD VALUE IF NOT EXISTS 'forwarder';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'forwarder';
ALTER TYPE public.edo_doc_status ADD VALUE IF NOT EXISTS 'prepared';
ALTER TYPE public.edo_doc_status ADD VALUE IF NOT EXISTS 'waiting_sender_signature';
ALTER TYPE public.edo_doc_status ADD VALUE IF NOT EXISTS 'waiting_forwarder_signature';
ALTER TYPE public.edo_doc_status ADD VALUE IF NOT EXISTS 'rejected';
ALTER TYPE public.edo_doc_status ADD VALUE IF NOT EXISTS 'failed';

-- Saby-specific fields on connections
ALTER TABLE public.carrier_edo_connections
  ADD COLUMN IF NOT EXISTS api_base_url text,
  ADD COLUMN IF NOT EXISTS login text,
  ADD COLUMN IF NOT EXISTS password text,
  ADD COLUMN IF NOT EXISTS app_client_id text,
  ADD COLUMN IF NOT EXISTS app_secret text,
  ADD COLUMN IF NOT EXISTS token text,
  ADD COLUMN IF NOT EXISTS edo_box_id text,
  ADD COLUMN IF NOT EXISTS certificate_thumbprint text,
  ADD COLUMN IF NOT EXISTS signing_mode text,
  ADD COLUMN IF NOT EXISTS integration_mode text DEFAULT 'mock';

-- Document-level Saby + signing + 1C fields
ALTER TABLE public.carrier_edo_documents
  ADD COLUMN IF NOT EXISTS saby_document_id text,
  ADD COLUMN IF NOT EXISTS saby_attachment_id text,
  ADD COLUMN IF NOT EXISTS saby_flk_errors jsonb,
  ADD COLUMN IF NOT EXISTS participant_links jsonb,
  ADD COLUMN IF NOT EXISTS signing_mode text,
  ADD COLUMN IF NOT EXISTS integration_mode text,
  ADD COLUMN IF NOT EXISTS export_to_1c_status text DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS exported_to_1c_at timestamptz,
  ADD COLUMN IF NOT EXISTS export_to_1c_error text,
  ADD COLUMN IF NOT EXISTS external_1c_id text,
  ADD COLUMN IF NOT EXISTS onec_exchange_direction text;