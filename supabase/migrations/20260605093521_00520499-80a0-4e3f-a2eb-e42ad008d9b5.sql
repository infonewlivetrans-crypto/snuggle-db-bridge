
ALTER TABLE public.dispatcher_driver_ext DROP CONSTRAINT IF EXISTS dispatcher_driver_status_chk;
ALTER TABLE public.dispatcher_driver_ext
  ADD CONSTRAINT dispatcher_driver_status_chk
  CHECK (dispatcher_status IN ('new','docs_unchecked','ready_to_work','free','on_trip','resting','inactive','blocked','archive'));

ALTER TABLE public.dispatcher_vehicle_ext DROP CONSTRAINT IF EXISTS dispatcher_vehicle_status_chk;
ALTER TABLE public.dispatcher_vehicle_ext
  ADD CONSTRAINT dispatcher_vehicle_status_chk
  CHECK (dispatcher_status IN ('new','docs_unchecked','available','waiting_freight','offered','on_trip','unloading','resting','inactive','blocked','archive'));

ALTER TABLE public.dispatcher_carrier_ext DROP CONSTRAINT IF EXISTS dispatcher_carrier_status_chk;
ALTER TABLE public.dispatcher_carrier_ext
  ADD CONSTRAINT dispatcher_carrier_status_chk
  CHECK (verification_status IN ('new','on_check','ready_to_work','missing_docs','blocked','archive'));
