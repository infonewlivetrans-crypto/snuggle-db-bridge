-- Add coordinate / navigation fields to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS landmarks TEXT,
  ADD COLUMN IF NOT EXISTS access_instructions TEXT,
  ADD COLUMN IF NOT EXISTS contact_name TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS map_link TEXT,
  ADD COLUMN IF NOT EXISTS delivery_photo_url TEXT;

-- Make delivery_address nullable (when only coordinates are provided)
ALTER TABLE public.orders
  ALTER COLUMN delivery_address DROP NOT NULL;

-- Validation: at least address OR coordinates must be present
CREATE OR REPLACE FUNCTION public.orders_validate_location()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (NEW.delivery_address IS NULL OR length(trim(NEW.delivery_address)) = 0)
     AND (NEW.latitude IS NULL OR NEW.longitude IS NULL) THEN
    RAISE EXCEPTION 'Order must have either delivery_address or coordinates (latitude + longitude)';
  END IF;

  IF NEW.latitude IS NOT NULL AND (NEW.latitude < -90 OR NEW.latitude > 90) THEN
    RAISE EXCEPTION 'latitude must be between -90 and 90';
  END IF;
  IF NEW.longitude IS NOT NULL AND (NEW.longitude < -180 OR NEW.longitude > 180) THEN
    RAISE EXCEPTION 'longitude must be between -180 and 180';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_validate_location ON public.orders;
CREATE TRIGGER trg_orders_validate_location
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.orders_validate_location();

-- Storage bucket for delivery location photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('delivery-photos', 'delivery-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Public read
DROP POLICY IF EXISTS "Delivery photos are publicly readable" ON storage.objects;
CREATE POLICY "Delivery photos are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'delivery-photos');

-- Public write (matches current open policies on other tables)
DROP POLICY IF EXISTS "Anyone can upload delivery photos" ON storage.objects;
CREATE POLICY "Anyone can upload delivery photos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'delivery-photos');

DROP POLICY IF EXISTS "Anyone can update delivery photos" ON storage.objects;
CREATE POLICY "Anyone can update delivery photos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'delivery-photos');

DROP POLICY IF EXISTS "Anyone can delete delivery photos" ON storage.objects;
CREATE POLICY "Anyone can delete delivery photos"
ON storage.objects FOR DELETE
USING (bucket_id = 'delivery-photos');