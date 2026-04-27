-- ============================================
-- Расширение таблицы warehouses
-- ============================================
ALTER TABLE public.warehouses
  ADD COLUMN IF NOT EXISTS latitude numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric,
  ADD COLUMN IF NOT EXISTS working_hours jsonb NOT NULL DEFAULT '{
    "mon": {"open": "08:00", "close": "18:00", "enabled": true},
    "tue": {"open": "08:00", "close": "18:00", "enabled": true},
    "wed": {"open": "08:00", "close": "18:00", "enabled": true},
    "thu": {"open": "08:00", "close": "18:00", "enabled": true},
    "fri": {"open": "08:00", "close": "18:00", "enabled": true},
    "sat": {"open": "09:00", "close": "14:00", "enabled": false},
    "sun": {"open": "09:00", "close": "14:00", "enabled": false}
  }'::jsonb,
  ADD COLUMN IF NOT EXISTS breaks jsonb NOT NULL DEFAULT '[
    {"label": "Обед", "start": "12:00", "end": "13:00"}
  ]'::jsonb,
  ADD COLUMN IF NOT EXISTS delivery_zone text,
  ADD COLUMN IF NOT EXISTS delivery_radius_km numeric,
  ADD COLUMN IF NOT EXISTS manager_name text,
  ADD COLUMN IF NOT EXISTS manager_phone text,
  ADD COLUMN IF NOT EXISTS notes text;

-- ============================================
-- Сотрудники склада
-- ============================================
DO $$ BEGIN
  CREATE TYPE public.warehouse_staff_role AS ENUM ('manager', 'storekeeper');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.warehouse_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid NOT NULL,
  full_name text NOT NULL,
  phone text,
  email text,
  role public.warehouse_staff_role NOT NULL DEFAULT 'storekeeper',
  is_active boolean NOT NULL DEFAULT true,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_warehouse_staff_warehouse_id ON public.warehouse_staff(warehouse_id);

ALTER TABLE public.warehouse_staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view warehouse_staff" ON public.warehouse_staff;
CREATE POLICY "Anyone can view warehouse_staff" ON public.warehouse_staff FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can insert warehouse_staff" ON public.warehouse_staff;
CREATE POLICY "Anyone can insert warehouse_staff" ON public.warehouse_staff FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update warehouse_staff" ON public.warehouse_staff;
CREATE POLICY "Anyone can update warehouse_staff" ON public.warehouse_staff FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Anyone can delete warehouse_staff" ON public.warehouse_staff;
CREATE POLICY "Anyone can delete warehouse_staff" ON public.warehouse_staff FOR DELETE USING (true);

DROP TRIGGER IF EXISTS trg_warehouse_staff_updated_at ON public.warehouse_staff;
CREATE TRIGGER trg_warehouse_staff_updated_at
  BEFORE UPDATE ON public.warehouse_staff
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- Окна загрузки/приёмки (док-слоты)
-- ============================================
DO $$ BEGIN
  CREATE TYPE public.dock_slot_kind AS ENUM (
    'shipment',        -- отгрузка машины с маршрутом
    'inbound_factory', -- приёмка товара с завода
    'inbound_return'   -- приёмка возврата
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.dock_slot_status AS ENUM (
    'planned',
    'arrived',
    'loading',
    'loaded',
    'done',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.warehouse_dock_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid NOT NULL,
  slot_kind public.dock_slot_kind NOT NULL,
  slot_date date NOT NULL DEFAULT CURRENT_DATE,
  start_time time NOT NULL,
  end_time time,
  route_id uuid,
  vehicle_id uuid,
  driver_id uuid,
  carrier_name text,
  driver_name text,
  vehicle_plate text,
  cargo_summary text,
  expected_arrival_at timestamptz,
  status public.dock_slot_status NOT NULL DEFAULT 'planned',
  arrived_at timestamptz,
  confirmed_at timestamptz,
  confirmed_by text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dock_slots_warehouse_date ON public.warehouse_dock_slots(warehouse_id, slot_date);
CREATE INDEX IF NOT EXISTS idx_dock_slots_route ON public.warehouse_dock_slots(route_id);
CREATE INDEX IF NOT EXISTS idx_dock_slots_status ON public.warehouse_dock_slots(status);

ALTER TABLE public.warehouse_dock_slots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view warehouse_dock_slots" ON public.warehouse_dock_slots;
CREATE POLICY "Anyone can view warehouse_dock_slots" ON public.warehouse_dock_slots FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can insert warehouse_dock_slots" ON public.warehouse_dock_slots;
CREATE POLICY "Anyone can insert warehouse_dock_slots" ON public.warehouse_dock_slots FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update warehouse_dock_slots" ON public.warehouse_dock_slots;
CREATE POLICY "Anyone can update warehouse_dock_slots" ON public.warehouse_dock_slots FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Anyone can delete warehouse_dock_slots" ON public.warehouse_dock_slots;
CREATE POLICY "Anyone can delete warehouse_dock_slots" ON public.warehouse_dock_slots FOR DELETE USING (true);

DROP TRIGGER IF EXISTS trg_dock_slots_updated_at ON public.warehouse_dock_slots;
CREATE TRIGGER trg_dock_slots_updated_at
  BEFORE UPDATE ON public.warehouse_dock_slots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- Realtime для оперативного обновления
-- ============================================
ALTER TABLE public.warehouse_dock_slots REPLICA IDENTITY FULL;
ALTER TABLE public.warehouse_staff REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.warehouse_dock_slots;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.warehouse_staff;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;