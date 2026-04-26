-- Enums
DO $$ BEGIN
  CREATE TYPE public.carrier_type AS ENUM ('self_employed', 'ip', 'ooo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.carrier_verification_status AS ENUM ('new', 'in_review', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.body_type AS ENUM (
    'tent', 'isotherm', 'refrigerator', 'flatbed', 'closed_van',
    'manipulator', 'tipper', 'container', 'car_carrier', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Carriers
CREATE TABLE IF NOT EXISTS public.carriers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_type public.carrier_type NOT NULL,
  company_name TEXT NOT NULL,
  inn TEXT,
  ogrn TEXT,
  phone TEXT,
  email TEXT,
  city TEXT,
  contact_person TEXT,
  bank_name TEXT,
  bank_account TEXT,
  bank_bik TEXT,
  bank_corr_account TEXT,
  verification_status public.carrier_verification_status NOT NULL DEFAULT 'new',
  verification_comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_carriers_status ON public.carriers(verification_status);

ALTER TABLE public.carriers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view carriers" ON public.carriers FOR SELECT USING (true);
CREATE POLICY "Anyone can insert carriers" ON public.carriers FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update carriers" ON public.carriers FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete carriers" ON public.carriers FOR DELETE USING (true);

CREATE TRIGGER trg_carriers_updated_at
BEFORE UPDATE ON public.carriers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Drivers
CREATE TABLE IF NOT EXISTS public.drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_id UUID NOT NULL REFERENCES public.carriers(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT,
  passport_series TEXT,
  passport_number TEXT,
  passport_issued_by TEXT,
  passport_issued_date DATE,
  license_number TEXT,
  license_issued_date DATE,
  license_expires_date DATE,
  license_categories TEXT,
  photo_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_drivers_carrier ON public.drivers(carrier_id);
CREATE INDEX IF NOT EXISTS idx_drivers_active ON public.drivers(is_active);

ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view drivers" ON public.drivers FOR SELECT USING (true);
CREATE POLICY "Anyone can insert drivers" ON public.drivers FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update drivers" ON public.drivers FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete drivers" ON public.drivers FOR DELETE USING (true);

CREATE TRIGGER trg_drivers_updated_at
BEFORE UPDATE ON public.drivers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Vehicles
CREATE TABLE IF NOT EXISTS public.vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_id UUID NOT NULL REFERENCES public.carriers(id) ON DELETE CASCADE,
  plate_number TEXT NOT NULL,
  brand TEXT,
  model TEXT,
  body_type public.body_type NOT NULL DEFAULT 'tent',
  capacity_kg NUMERIC(10, 2),
  volume_m3 NUMERIC(10, 2),
  body_length_m NUMERIC(6, 2),
  body_width_m NUMERIC(6, 2),
  body_height_m NUMERIC(6, 2),
  tie_rings_count INTEGER NOT NULL DEFAULT 0,
  has_straps BOOLEAN NOT NULL DEFAULT false,
  has_tent BOOLEAN NOT NULL DEFAULT false,
  has_manipulator BOOLEAN NOT NULL DEFAULT false,
  comment TEXT,
  -- Photos
  photo_front_url TEXT,
  photo_back_url TEXT,
  photo_left_url TEXT,
  photo_right_url TEXT,
  photo_inside_url TEXT,
  photo_documents_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vehicles_carrier ON public.vehicles(carrier_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_body_type ON public.vehicles(body_type);
CREATE INDEX IF NOT EXISTS idx_vehicles_capacity ON public.vehicles(capacity_kg);
CREATE INDEX IF NOT EXISTS idx_vehicles_volume ON public.vehicles(volume_m3);

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view vehicles" ON public.vehicles FOR SELECT USING (true);
CREATE POLICY "Anyone can insert vehicles" ON public.vehicles FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update vehicles" ON public.vehicles FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete vehicles" ON public.vehicles FOR DELETE USING (true);

CREATE TRIGGER trg_vehicles_updated_at
BEFORE UPDATE ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for vehicle/driver photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('vehicle-photos', 'vehicle-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Vehicle photos public read" ON storage.objects;
CREATE POLICY "Vehicle photos public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'vehicle-photos');

DROP POLICY IF EXISTS "Anyone can upload vehicle photos" ON storage.objects;
CREATE POLICY "Anyone can upload vehicle photos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'vehicle-photos');

DROP POLICY IF EXISTS "Anyone can update vehicle photos" ON storage.objects;
CREATE POLICY "Anyone can update vehicle photos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'vehicle-photos');

DROP POLICY IF EXISTS "Anyone can delete vehicle photos" ON storage.objects;
CREATE POLICY "Anyone can delete vehicle photos"
ON storage.objects FOR DELETE
USING (bucket_id = 'vehicle-photos');