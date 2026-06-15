
-- RLS для public.dispatcher_documents: разрешаем перевозчику работать
-- со своими документами (carrier ext / свои машины / свои водители).
-- Удаление и одобрение по-прежнему доступны только админу/диспетчеру.

CREATE POLICY "dispatcher_documents_select_own_carrier"
ON public.dispatcher_documents
FOR SELECT
TO authenticated
USING (
  (
    owner_type = 'carrier'
    AND owner_id = public.carrier_my_ext_id()
  )
  OR (
    owner_type = 'driver'
    AND owner_id IN (
      SELECT id FROM public.dispatcher_driver_ext
      WHERE dispatcher_carrier_ext_id = public.carrier_my_ext_id()
    )
  )
  OR (
    owner_type = 'vehicle'
    AND owner_id IN (
      SELECT id FROM public.dispatcher_vehicle_ext
      WHERE dispatcher_carrier_ext_id = public.carrier_my_ext_id()
    )
  )
);

CREATE POLICY "dispatcher_documents_insert_own_carrier"
ON public.dispatcher_documents
FOR INSERT
TO authenticated
WITH CHECK (
  document_status IN ('uploaded','checking')
  AND (
    (
      owner_type = 'carrier'
      AND owner_id = public.carrier_my_ext_id()
    )
    OR (
      owner_type = 'driver'
      AND owner_id IN (
        SELECT id FROM public.dispatcher_driver_ext
        WHERE dispatcher_carrier_ext_id = public.carrier_my_ext_id()
      )
    )
    OR (
      owner_type = 'vehicle'
      AND owner_id IN (
        SELECT id FROM public.dispatcher_vehicle_ext
        WHERE dispatcher_carrier_ext_id = public.carrier_my_ext_id()
      )
    )
  )
);

CREATE POLICY "dispatcher_documents_update_own_carrier"
ON public.dispatcher_documents
FOR UPDATE
TO authenticated
USING (
  (
    owner_type = 'carrier'
    AND owner_id = public.carrier_my_ext_id()
  )
  OR (
    owner_type = 'driver'
    AND owner_id IN (
      SELECT id FROM public.dispatcher_driver_ext
      WHERE dispatcher_carrier_ext_id = public.carrier_my_ext_id()
    )
  )
  OR (
    owner_type = 'vehicle'
    AND owner_id IN (
      SELECT id FROM public.dispatcher_vehicle_ext
      WHERE dispatcher_carrier_ext_id = public.carrier_my_ext_id()
    )
  )
)
WITH CHECK (
  document_status IN ('uploaded','checking')
  AND (
    (
      owner_type = 'carrier'
      AND owner_id = public.carrier_my_ext_id()
    )
    OR (
      owner_type = 'driver'
      AND owner_id IN (
        SELECT id FROM public.dispatcher_driver_ext
        WHERE dispatcher_carrier_ext_id = public.carrier_my_ext_id()
      )
    )
    OR (
      owner_type = 'vehicle'
      AND owner_id IN (
        SELECT id FROM public.dispatcher_vehicle_ext
        WHERE dispatcher_carrier_ext_id = public.carrier_my_ext_id()
      )
    )
  )
);

-- Storage: разрешаем перевозчику работать с файлами в bucket
-- 'dispatcher-documents'. Путь файлов имеет вид
--   {owner_type}/{owner_id}/{uuid}.{ext}
-- — проверяем по (storage.foldername(name))[1] и [2].

CREATE POLICY "dispatcher_documents_storage_select_carrier"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'dispatcher-documents'
  AND (
    (
      (storage.foldername(name))[1] = 'carrier'
      AND (storage.foldername(name))[2]::uuid = public.carrier_my_ext_id()
    )
    OR (
      (storage.foldername(name))[1] = 'driver'
      AND (storage.foldername(name))[2]::uuid IN (
        SELECT id FROM public.dispatcher_driver_ext
        WHERE dispatcher_carrier_ext_id = public.carrier_my_ext_id()
      )
    )
    OR (
      (storage.foldername(name))[1] = 'vehicle'
      AND (storage.foldername(name))[2]::uuid IN (
        SELECT id FROM public.dispatcher_vehicle_ext
        WHERE dispatcher_carrier_ext_id = public.carrier_my_ext_id()
      )
    )
  )
);

CREATE POLICY "dispatcher_documents_storage_insert_carrier"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'dispatcher-documents'
  AND (
    (
      (storage.foldername(name))[1] = 'carrier'
      AND (storage.foldername(name))[2]::uuid = public.carrier_my_ext_id()
    )
    OR (
      (storage.foldername(name))[1] = 'driver'
      AND (storage.foldername(name))[2]::uuid IN (
        SELECT id FROM public.dispatcher_driver_ext
        WHERE dispatcher_carrier_ext_id = public.carrier_my_ext_id()
      )
    )
    OR (
      (storage.foldername(name))[1] = 'vehicle'
      AND (storage.foldername(name))[2]::uuid IN (
        SELECT id FROM public.dispatcher_vehicle_ext
        WHERE dispatcher_carrier_ext_id = public.carrier_my_ext_id()
      )
    )
  )
);

CREATE POLICY "dispatcher_documents_storage_update_carrier"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'dispatcher-documents'
  AND (
    (
      (storage.foldername(name))[1] = 'carrier'
      AND (storage.foldername(name))[2]::uuid = public.carrier_my_ext_id()
    )
    OR (
      (storage.foldername(name))[1] = 'driver'
      AND (storage.foldername(name))[2]::uuid IN (
        SELECT id FROM public.dispatcher_driver_ext
        WHERE dispatcher_carrier_ext_id = public.carrier_my_ext_id()
      )
    )
    OR (
      (storage.foldername(name))[1] = 'vehicle'
      AND (storage.foldername(name))[2]::uuid IN (
        SELECT id FROM public.dispatcher_vehicle_ext
        WHERE dispatcher_carrier_ext_id = public.carrier_my_ext_id()
      )
    )
  )
);
