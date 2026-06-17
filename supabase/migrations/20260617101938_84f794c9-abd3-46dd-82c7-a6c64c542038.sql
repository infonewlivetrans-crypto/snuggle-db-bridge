
-- Carrier can INSERT inbound doc rows for their own carrier_ext_id
DROP POLICY IF EXISTS inbound_docs_carrier_insert ON public.dispatcher_inbound_documents;
CREATE POLICY inbound_docs_carrier_insert ON public.dispatcher_inbound_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.dispatcher_carrier_users dcu
      WHERE dcu.dispatcher_carrier_ext_id = carrier_ext_id
        AND dcu.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS inbound_docs_carrier_update ON public.dispatcher_inbound_documents;
CREATE POLICY inbound_docs_carrier_update ON public.dispatcher_inbound_documents
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.dispatcher_carrier_users dcu
      WHERE dcu.dispatcher_carrier_ext_id = carrier_ext_id
        AND dcu.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.dispatcher_carrier_users dcu
      WHERE dcu.dispatcher_carrier_ext_id = carrier_ext_id
        AND dcu.user_id = auth.uid()
    )
  );

-- Carrier can INSERT attachments into their own folder of inbound-documents bucket
DROP POLICY IF EXISTS inbound_docs_objects_carrier_write ON storage.objects;
CREATE POLICY inbound_docs_objects_carrier_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'inbound-documents'
    AND EXISTS (
      SELECT 1 FROM public.dispatcher_carrier_users dcu
      WHERE dcu.user_id = auth.uid()
        AND dcu.dispatcher_carrier_ext_id::text = split_part(name, '/', 1)
    )
  );
