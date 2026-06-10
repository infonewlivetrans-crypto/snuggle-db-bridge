
-- Extend dispatcher_freights with assignment + pipeline fields
ALTER TABLE public.dispatcher_freights
  ADD COLUMN IF NOT EXISTS assigned_carrier_ext_id uuid REFERENCES public.dispatcher_carrier_ext(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_driver_ext_id  uuid REFERENCES public.dispatcher_driver_ext(id)  ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_vehicle_ext_id uuid REFERENCES public.dispatcher_vehicle_ext(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS carrier_request_id uuid REFERENCES public.dispatcher_carrier_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deal_id uuid REFERENCES public.dispatcher_deals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS signed_pdf_document_id uuid REFERENCES public.dispatcher_documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS signed_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS signed_sent_channel text,
  ADD COLUMN IF NOT EXISTS signed_sent_comment text;

-- Update freight status check to include the new pipeline statuses
ALTER TABLE public.dispatcher_freights DROP CONSTRAINT IF EXISTS dispatcher_freights_dispatcher_status_chk;
ALTER TABLE public.dispatcher_freights
  ADD CONSTRAINT dispatcher_freights_dispatcher_status_chk
  CHECK (dispatcher_status = ANY (ARRAY[
    'new','checking','suitable','offered','booked','rejected','cancelled','archived',
    'customer_called','customer_ready','not_suitable','waiting_docs','docs_received',
    'carrier_signing','signed_sent','deal_created'
  ]));

-- Allow documents to belong to a deal too
ALTER TABLE public.dispatcher_documents DROP CONSTRAINT IF EXISTS dispatcher_documents_owner_type_check;
ALTER TABLE public.dispatcher_documents
  ADD CONSTRAINT dispatcher_documents_owner_type_check
  CHECK (owner_type = ANY (ARRAY['carrier','driver','vehicle','freight','deal']));
