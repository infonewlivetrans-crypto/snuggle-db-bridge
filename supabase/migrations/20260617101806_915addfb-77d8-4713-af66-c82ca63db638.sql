
DROP POLICY IF EXISTS inbound_docs_objects_admin_all ON storage.objects;
CREATE POLICY inbound_docs_objects_admin_all ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'inbound-documents'
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher'))
  )
  WITH CHECK (
    bucket_id = 'inbound-documents'
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher'))
  );

DROP POLICY IF EXISTS inbound_docs_objects_carrier_read ON storage.objects;
CREATE POLICY inbound_docs_objects_carrier_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'inbound-documents'
    AND EXISTS (
      SELECT 1 FROM public.dispatcher_carrier_users dcu
      WHERE dcu.user_id = auth.uid()
        AND dcu.dispatcher_carrier_ext_id::text = split_part(name, '/', 1)
    )
  );
