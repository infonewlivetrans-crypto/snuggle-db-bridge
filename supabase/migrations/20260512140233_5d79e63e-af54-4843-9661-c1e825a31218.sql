-- Production schema sync for transport entities and settings
-- Idempotent: safe to run on environments where some objects already exist.

-- Required enum types and values
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin','director','logist','manager','warehouse','supply','driver','carrier');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'director';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'logist';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'warehouse';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'supply';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'driver';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'carrier';

DO $$ BEGIN
  CREATE TYPE public.carrier_type AS ENUM ('self_employed','ip','ooo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.carrier_verification_status AS ENUM ('new','in_review','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.body_type AS ENUM ('tent','isotherm','refrigerator','flatbed','closed_van','manipulator','tipper','container','car_carrier','gazelle','sideboard','long_vehicle','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TYPE public.body_type ADD VALUE IF NOT EXISTS 'gazelle';
ALTER TYPE public.body_type ADD VALUE IF NOT EXISTS 'sideboard';
ALTER TYPE public.body_type ADD VALUE IF NOT EXISTS 'long_vehicle';

DO $$ BEGIN
  CREATE TYPE public.order_status AS ENUM ('new','in_progress','delivering','completed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'delivered';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'not_delivered';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'defective';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'awaiting_resend';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'ready_for_delivery';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'awaiting_return';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'return_accepted';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'excluded_from_route';

DO $$ BEGIN
  CREATE TYPE public.payment_type AS ENUM ('cash','card','online','qr');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_status AS ENUM ('not_paid','partial','paid','refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Common timestamp trigger helper
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Roles table and helper for RLS
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

DROP POLICY IF EXISTS user_roles_select_own_or_admin ON public.user_roles;
CREATE POLICY user_roles_select_own_or_admin ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS user_roles_admin_all ON public.user_roles;
CREATE POLICY user_roles_admin_all ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Company helper compatibility for environments that already use company isolation
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.company_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_company_members_user ON public.company_members(user_id);
CREATE INDEX IF NOT EXISTS idx_company_members_company ON public.company_members(company_id);

INSERT INTO public.companies (id, name, is_active)
VALUES ('00000000-0000-0000-0000-000000000001', 'Радиус Трек', true)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.default_company_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id
    FROM public.company_members
   WHERE user_id = _user_id
   ORDER BY is_default DESC, created_at ASC
   LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.has_company_access(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _company_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.company_members
         WHERE user_id = _user_id AND company_id = _company_id
      )
$$;

CREATE OR REPLACE FUNCTION public.set_company_id_from_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    NEW.company_id := COALESCE(public.default_company_id(auth.uid()), '00000000-0000-0000-0000-000000000001');
  END IF;
  RETURN NEW;
END;
$$;

-- Core tables
CREATE TABLE IF NOT EXISTS public.carriers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_type public.carrier_type NOT NULL DEFAULT 'ip',
  company_name text NOT NULL,
  inn text,
  ogrn text,
  phone text,
  email text,
  city text,
  contact_person text,
  bank_name text,
  bank_account text,
  bank_bik text,
  bank_corr_account text,
  verification_status public.carrier_verification_status NOT NULL DEFAULT 'new',
  verification_comment text,
  portal_token text UNIQUE,
  external_id text,
  source text NOT NULL DEFAULT 'manual',
  company_id uuid REFERENCES public.companies(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.carriers
  ADD COLUMN IF NOT EXISTS carrier_type public.carrier_type NOT NULL DEFAULT 'ip',
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS inn text,
  ADD COLUMN IF NOT EXISTS ogrn text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS contact_person text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS bank_account text,
  ADD COLUMN IF NOT EXISTS bank_bik text,
  ADD COLUMN IF NOT EXISTS bank_corr_account text,
  ADD COLUMN IF NOT EXISTS verification_status public.carrier_verification_status NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS verification_comment text,
  ADD COLUMN IF NOT EXISTS portal_token text,
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id),
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_id uuid NOT NULL REFERENCES public.carriers(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  phone text,
  passport_series text,
  passport_number text,
  passport_issued_by text,
  passport_issued_date date,
  license_number text,
  license_issued_date date,
  license_expires_date date,
  license_categories text,
  photo_url text,
  is_active boolean NOT NULL DEFAULT true,
  comment text,
  portal_token text UNIQUE,
  external_id text,
  source text NOT NULL DEFAULT 'manual',
  company_id uuid REFERENCES public.companies(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS carrier_id uuid REFERENCES public.carriers(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS passport_series text,
  ADD COLUMN IF NOT EXISTS passport_number text,
  ADD COLUMN IF NOT EXISTS passport_issued_by text,
  ADD COLUMN IF NOT EXISTS passport_issued_date date,
  ADD COLUMN IF NOT EXISTS license_number text,
  ADD COLUMN IF NOT EXISTS license_issued_date date,
  ADD COLUMN IF NOT EXISTS license_expires_date date,
  ADD COLUMN IF NOT EXISTS license_categories text,
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS comment text,
  ADD COLUMN IF NOT EXISTS portal_token text,
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id),
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_id uuid NOT NULL REFERENCES public.carriers(id) ON DELETE CASCADE,
  plate_number text NOT NULL,
  brand text,
  model text,
  body_type public.body_type NOT NULL DEFAULT 'tent',
  capacity_kg numeric,
  volume_m3 numeric,
  body_length_m numeric,
  body_width_m numeric,
  body_height_m numeric,
  tie_rings_count integer NOT NULL DEFAULT 0,
  has_straps boolean NOT NULL DEFAULT false,
  has_tent boolean NOT NULL DEFAULT false,
  has_manipulator boolean NOT NULL DEFAULT false,
  comment text,
  photo_front_url text,
  photo_back_url text,
  photo_left_url text,
  photo_right_url text,
  photo_inside_url text,
  photo_documents_url text,
  is_active boolean NOT NULL DEFAULT true,
  company_id uuid REFERENCES public.companies(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS carrier_id uuid REFERENCES public.carriers(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS plate_number text,
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS body_type public.body_type NOT NULL DEFAULT 'tent',
  ADD COLUMN IF NOT EXISTS capacity_kg numeric,
  ADD COLUMN IF NOT EXISTS volume_m3 numeric,
  ADD COLUMN IF NOT EXISTS body_length_m numeric,
  ADD COLUMN IF NOT EXISTS body_width_m numeric,
  ADD COLUMN IF NOT EXISTS body_height_m numeric,
  ADD COLUMN IF NOT EXISTS tie_rings_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS has_straps boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_tent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_manipulator boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS comment text,
  ADD COLUMN IF NOT EXISTS photo_front_url text,
  ADD COLUMN IF NOT EXISTS photo_back_url text,
  ADD COLUMN IF NOT EXISTS photo_left_url text,
  ADD COLUMN IF NOT EXISTS photo_right_url text,
  ADD COLUMN IF NOT EXISTS photo_inside_url text,
  ADD COLUMN IF NOT EXISTS photo_documents_url text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id),
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  status public.order_status NOT NULL DEFAULT 'new',
  delivery_address text,
  payment_type public.payment_type NOT NULL DEFAULT 'cash',
  payment_status public.payment_status NOT NULL DEFAULT 'not_paid',
  requires_qr boolean NOT NULL DEFAULT false,
  comment text,
  cash_received boolean NOT NULL DEFAULT false,
  qr_received boolean NOT NULL DEFAULT false,
  latitude numeric,
  longitude numeric,
  landmarks text,
  access_instructions text,
  contact_name text,
  contact_phone text,
  map_link text,
  delivery_photo_url text,
  total_weight_kg numeric,
  total_volume_m3 numeric,
  items_count integer,
  external_id text,
  source text NOT NULL DEFAULT 'manual',
  qr_photo_url text,
  qr_photo_uploaded_at timestamptz,
  qr_photo_uploaded_by text,
  delivery_cost numeric NOT NULL DEFAULT 0,
  delivery_cost_source text NOT NULL DEFAULT 'auto',
  delivery_zone text,
  destination_city text,
  goods_amount numeric,
  applied_tariff_id uuid,
  manual_cost_reason text,
  manual_cost_set_by text,
  manual_cost_set_at timestamptz,
  amount_due numeric,
  marketplace text,
  client_works_weekends boolean NOT NULL DEFAULT false,
  onec_order_number text,
  onec_transport_request_number text,
  characteristic text,
  quality text,
  delivery_window_from time,
  delivery_window_to time,
  client_type text,
  delivery_time_comment text,
  company_id uuid REFERENCES public.companies(id),
  manager_id uuid,
  manager_name text,
  driver_comment text,
  driver_comment_is_important boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_status public.payment_status NOT NULL DEFAULT 'not_paid',
  ADD COLUMN IF NOT EXISTS amount_due numeric,
  ADD COLUMN IF NOT EXISTS marketplace text,
  ADD COLUMN IF NOT EXISTS client_works_weekends boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onec_order_number text,
  ADD COLUMN IF NOT EXISTS onec_transport_request_number text,
  ADD COLUMN IF NOT EXISTS characteristic text,
  ADD COLUMN IF NOT EXISTS quality text,
  ADD COLUMN IF NOT EXISTS delivery_window_from time,
  ADD COLUMN IF NOT EXISTS delivery_window_to time,
  ADD COLUMN IF NOT EXISTS client_type text,
  ADD COLUMN IF NOT EXISTS delivery_time_comment text,
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id),
  ADD COLUMN IF NOT EXISTS manager_id uuid,
  ADD COLUMN IF NOT EXISTS manager_name text,
  ADD COLUMN IF NOT EXISTS driver_comment text,
  ADD COLUMN IF NOT EXISTS driver_comment_is_important boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS latitude numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric,
  ADD COLUMN IF NOT EXISTS landmarks text,
  ADD COLUMN IF NOT EXISTS access_instructions text,
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS map_link text,
  ADD COLUMN IF NOT EXISTS delivery_photo_url text,
  ADD COLUMN IF NOT EXISTS total_weight_kg numeric,
  ADD COLUMN IF NOT EXISTS total_volume_m3 numeric,
  ADD COLUMN IF NOT EXISTS items_count integer,
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS qr_photo_url text,
  ADD COLUMN IF NOT EXISTS qr_photo_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS qr_photo_uploaded_by text,
  ADD COLUMN IF NOT EXISTS delivery_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_cost_source text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS delivery_zone text,
  ADD COLUMN IF NOT EXISTS destination_city text,
  ADD COLUMN IF NOT EXISTS goods_amount numeric,
  ADD COLUMN IF NOT EXISTS applied_tariff_id uuid,
  ADD COLUMN IF NOT EXISTS manual_cost_reason text,
  ADD COLUMN IF NOT EXISTS manual_cost_set_by text,
  ADD COLUMN IF NOT EXISTS manual_cost_set_at timestamptz;

ALTER TABLE public.orders ALTER COLUMN delivery_address DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text NOT NULL UNIQUE,
  setting_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  category text NOT NULL DEFAULT 'general',
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS setting_key text,
  ADD COLUMN IF NOT EXISTS setting_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Constraints/indexes/triggers
CREATE UNIQUE INDEX IF NOT EXISTS idx_system_settings_setting_key_unique ON public.system_settings(setting_key);
CREATE INDEX IF NOT EXISTS idx_system_settings_category ON public.system_settings(category);
CREATE INDEX IF NOT EXISTS idx_carriers_status ON public.carriers(verification_status);
CREATE INDEX IF NOT EXISTS idx_carriers_company_id ON public.carriers(company_id);
CREATE INDEX IF NOT EXISTS idx_drivers_carrier ON public.drivers(carrier_id);
CREATE INDEX IF NOT EXISTS idx_drivers_active ON public.drivers(is_active);
CREATE INDEX IF NOT EXISTS idx_drivers_company_id ON public.drivers(company_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_carrier ON public.vehicles(carrier_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_body_type ON public.vehicles(body_type);
CREATE INDEX IF NOT EXISTS idx_vehicles_company_id ON public.vehicles(company_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_company_id ON public.orders(company_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['carriers','drivers','vehicles','orders','system_settings'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t, t);
  END LOOP;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['carriers','drivers','vehicles','orders'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_set_company ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_set_company BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_company_id_from_user()', t, t);
  END LOOP;
END $$;

-- Seed settings expected by the current UI
INSERT INTO public.system_settings (setting_key, setting_value, description, category, is_public)
VALUES
  ('launch.mode', '"full"'::jsonb, 'Режим запуска интерфейса: full или minimal', 'general', true),
  ('demo_mode_enabled', 'false'::jsonb, 'Включает демо-режим интерфейса', 'general', true),
  ('driver_document_photos_enabled', 'false'::jsonb, 'Включает дополнительные фото документов у водителя', 'driver', true),
  ('modules.enabled', '{"warehouse":false,"supply":false,"accounting":false,"carriers":false,"onec":false,"excel_import":true}'::jsonb, 'Включение дополнительных модулей интерфейса', 'modules', true),
  ('gps_deviation_threshold_m', '1000'::jsonb, 'Порог GPS-отклонения от маршрута в метрах', 'gps', true)
ON CONFLICT (setting_key) DO NOTHING;

-- RLS policies
ALTER TABLE public.carriers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS carriers_select_all ON public.carriers;
CREATE POLICY carriers_select_all ON public.carriers FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS carriers_insert_role ON public.carriers;
CREATE POLICY carriers_insert_role ON public.carriers FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'logist'::public.app_role));
DROP POLICY IF EXISTS carriers_update_role ON public.carriers;
CREATE POLICY carriers_update_role ON public.carriers FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'logist'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'logist'::public.app_role));
DROP POLICY IF EXISTS carriers_delete_role ON public.carriers;
CREATE POLICY carriers_delete_role ON public.carriers FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'logist'::public.app_role));

DROP POLICY IF EXISTS drivers_select_all ON public.drivers;
CREATE POLICY drivers_select_all ON public.drivers FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS drivers_insert_role ON public.drivers;
CREATE POLICY drivers_insert_role ON public.drivers FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'logist'::public.app_role));
DROP POLICY IF EXISTS drivers_update_role ON public.drivers;
CREATE POLICY drivers_update_role ON public.drivers FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'logist'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'logist'::public.app_role));
DROP POLICY IF EXISTS drivers_delete_role ON public.drivers;
CREATE POLICY drivers_delete_role ON public.drivers FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'logist'::public.app_role));

DROP POLICY IF EXISTS vehicles_select_all ON public.vehicles;
CREATE POLICY vehicles_select_all ON public.vehicles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS vehicles_insert_role ON public.vehicles;
CREATE POLICY vehicles_insert_role ON public.vehicles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'logist'::public.app_role));
DROP POLICY IF EXISTS vehicles_update_role ON public.vehicles;
CREATE POLICY vehicles_update_role ON public.vehicles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'logist'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'logist'::public.app_role));
DROP POLICY IF EXISTS vehicles_delete_role ON public.vehicles;
CREATE POLICY vehicles_delete_role ON public.vehicles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'logist'::public.app_role));

DROP POLICY IF EXISTS orders_select_all ON public.orders;
CREATE POLICY orders_select_all ON public.orders FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS orders_insert_role ON public.orders;
CREATE POLICY orders_insert_role ON public.orders FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'logist'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role));
DROP POLICY IF EXISTS orders_update_role ON public.orders;
CREATE POLICY orders_update_role ON public.orders FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'logist'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'logist'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role));
DROP POLICY IF EXISTS orders_delete_role ON public.orders;
CREATE POLICY orders_delete_role ON public.orders FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'logist'::public.app_role));

DROP POLICY IF EXISTS system_settings_select_public ON public.system_settings;
CREATE POLICY system_settings_select_public ON public.system_settings FOR SELECT USING (is_public = true OR public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS system_settings_insert_role ON public.system_settings;
CREATE POLICY system_settings_insert_role ON public.system_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS system_settings_update_role ON public.system_settings;
CREATE POLICY system_settings_update_role ON public.system_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS system_settings_delete_role ON public.system_settings;
CREATE POLICY system_settings_delete_role ON public.system_settings FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Keep existing company isolation compatible, but do not block rows without company_id.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['carriers','drivers','vehicles','orders'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_company_isolation ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_company_isolation ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (company_id IS NULL OR public.has_company_access(auth.uid(), company_id)) WITH CHECK (company_id IS NULL OR public.has_company_access(auth.uid(), company_id))',
      t, t
    );
  END LOOP;
END $$;

-- Backfill company_id for existing rows where possible.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['carriers','drivers','vehicles','orders'] LOOP
    EXECUTE format('UPDATE public.%I SET company_id = COALESCE(company_id, ''00000000-0000-0000-0000-000000000001''::uuid) WHERE company_id IS NULL', t);
  END LOOP;
END $$;