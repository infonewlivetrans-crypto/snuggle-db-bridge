ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS user_id uuid NULL
    REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS drivers_user_id_key
  ON public.drivers(user_id)
  WHERE user_id IS NOT NULL;

ALTER TABLE public.delivery_routes
  ADD COLUMN IF NOT EXISTS driver_id uuid NULL
    REFERENCES public.drivers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS delivery_routes_driver_id_idx
  ON public.delivery_routes(driver_id);

CREATE UNIQUE INDEX IF NOT EXISTS drivers_carrier_phone_key
  ON public.drivers(carrier_id, phone)
  WHERE phone IS NOT NULL AND phone <> '';