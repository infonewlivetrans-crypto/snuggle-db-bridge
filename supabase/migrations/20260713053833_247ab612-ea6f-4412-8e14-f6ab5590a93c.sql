
-- 1. Fix SECURITY DEFINER view
ALTER VIEW public.carrier_edo_connections_safe SET (security_invoker = true);

-- 2. carrier_documents: remove public SELECT
DROP POLICY IF EXISTS carrier_documents_select_all ON public.carrier_documents;
CREATE POLICY carrier_documents_select_auth ON public.carrier_documents
  FOR SELECT TO authenticated USING (true);

-- 3. carrier_invites: remove public SELECT
DROP POLICY IF EXISTS carrier_invites_select_all ON public.carrier_invites;
CREATE POLICY carrier_invites_select_role ON public.carrier_invites
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role));

-- 4. driver_locations: remove public SELECT/INSERT
DROP POLICY IF EXISTS driver_locations_select_all ON public.driver_locations;
DROP POLICY IF EXISTS driver_locations_insert_all ON public.driver_locations;
CREATE POLICY driver_locations_select_auth ON public.driver_locations
  FOR SELECT TO authenticated USING (true);

-- 5. notifications: remove public SELECT
DROP POLICY IF EXISTS notifications_select_all ON public.notifications;
CREATE POLICY notifications_select_auth ON public.notifications
  FOR SELECT TO authenticated USING (true);

-- 6. onec_outbound: remove public SELECT
DROP POLICY IF EXISTS onec_outbound_select_all ON public.onec_outbound;
CREATE POLICY onec_outbound_select_auth ON public.onec_outbound
  FOR SELECT TO authenticated USING (true);

-- 7. system_settings: remove blanket public SELECT (select_public remains for is_public rows / admin)
DROP POLICY IF EXISTS system_settings_select_all ON public.system_settings;
CREATE POLICY system_settings_select_auth ON public.system_settings
  FOR SELECT TO authenticated USING (true);

-- 8. warehouse_staff: remove public SELECT
DROP POLICY IF EXISTS warehouse_staff_select_all ON public.warehouse_staff;
CREATE POLICY warehouse_staff_select_auth ON public.warehouse_staff
  FOR SELECT TO authenticated USING (true);

-- 9. Storage: remove public write/delete/update on photo buckets; keep public read
DROP POLICY IF EXISTS "Anyone can upload delivery photos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update delivery photos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete delivery photos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload vehicle photos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update vehicle photos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete vehicle photos" ON storage.objects;
DROP POLICY IF EXISTS "route_point_photos_public_insert" ON storage.objects;
DROP POLICY IF EXISTS "route_point_photos_public_update" ON storage.objects;
DROP POLICY IF EXISTS "route_point_photos_public_delete" ON storage.objects;
DROP POLICY IF EXISTS "QR photos public insert" ON storage.objects;
DROP POLICY IF EXISTS "QR photos public update" ON storage.objects;

CREATE POLICY "Authenticated can upload delivery photos" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'delivery-photos');
CREATE POLICY "Authenticated can update delivery photos" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'delivery-photos');
CREATE POLICY "Authenticated can delete delivery photos" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'delivery-photos');

CREATE POLICY "Authenticated can upload vehicle photos" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'vehicle-photos');
CREATE POLICY "Authenticated can update vehicle photos" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'vehicle-photos');
CREATE POLICY "Authenticated can delete vehicle photos" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'vehicle-photos');

CREATE POLICY "route_point_photos_auth_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'route-point-photos');
CREATE POLICY "route_point_photos_auth_update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'route-point-photos');
CREATE POLICY "route_point_photos_auth_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'route-point-photos');

CREATE POLICY "QR photos auth insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'qr-photos');
CREATE POLICY "QR photos auth update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'qr-photos');
