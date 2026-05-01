
-- =========================================================================
-- ЭТАП 1: МУЛЬТИТЕНАНТНОСТЬ — ИЗОЛЯЦИЯ ДАННЫХ ПО КОМПАНИЯМ
-- =========================================================================

-- 1. Тип компании
DO $$ BEGIN
  CREATE TYPE public.company_type AS ENUM ('shipper', 'carrier', 'mixed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Таблица компаний
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  company_type public.company_type NOT NULL DEFAULT 'mixed',
  inn text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- 3. Членство пользователей в компаниях
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

ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;

-- 4. Хелперы (SECURITY DEFINER, чтобы избежать рекурсии в RLS)
CREATE OR REPLACE FUNCTION public.user_company_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.company_members WHERE user_id = _user_id
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

-- 5. RLS на companies / company_members
DROP POLICY IF EXISTS companies_select_member ON public.companies;
CREATE POLICY companies_select_member ON public.companies
  FOR SELECT TO authenticated
  USING (public.has_company_access(auth.uid(), id) OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS companies_modify_admin ON public.companies;
CREATE POLICY companies_modify_admin ON public.companies
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND public.has_company_access(auth.uid(), id))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS company_members_select ON public.company_members;
CREATE POLICY company_members_select ON public.company_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS company_members_modify_admin ON public.company_members;
CREATE POLICY company_members_modify_admin ON public.company_members
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 6. Создаём дефолтную компанию «Радиус Трек»
INSERT INTO public.companies (id, name, company_type, is_active)
VALUES ('00000000-0000-0000-0000-000000000001', 'Радиус Трек', 'mixed', true)
ON CONFLICT (id) DO NOTHING;

-- 7. Привязываем всех существующих пользователей к этой компании
INSERT INTO public.company_members (user_id, company_id, is_default)
SELECT p.user_id, '00000000-0000-0000-0000-000000000001', true
  FROM public.profiles p
 WHERE NOT EXISTS (
   SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = p.user_id
      AND cm.company_id = '00000000-0000-0000-0000-000000000001'
 );

-- 8. Добавляем company_id во все ключевые таблицы и бэкфиллим дефолтом
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'profiles','orders','order_items','order_history','order_problem_reports',
    'delivery_reports','delivery_routes','routes','route_points','route_point_actions',
    'route_point_photos','driver_locations','warehouses','products','stock_movements',
    'inbound_shipments','inbound_shipment_items','carriers','drivers','vehicles',
    'supply_requests','supply_in_transit','transport_requests','delivery_tariffs',
    'import_logs','import_log_rows','feedback','pilot_tasks','clients'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema='public' AND table_name=t
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id)',
        t
      );
      EXECUTE format(
        'UPDATE public.%I SET company_id = ''00000000-0000-0000-0000-000000000001'' WHERE company_id IS NULL',
        t
      );
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS idx_%I_company_id ON public.%I(company_id)',
        t, t
      );
    END IF;
  END LOOP;
END $$;

-- 9. RLS-надстройка по компании для каждой таблицы
-- Существующие политики оставляем (роли). Добавляем РЕСТРИКТИВНУЮ политику,
-- которая дополнительно требует, чтобы запись принадлежала компании пользователя.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'profiles','orders','order_items','order_history','order_problem_reports',
    'delivery_reports','delivery_routes','routes','route_points','route_point_actions',
    'route_point_photos','driver_locations','warehouses','products','stock_movements',
    'inbound_shipments','inbound_shipment_items','carriers','drivers','vehicles',
    'supply_requests','supply_in_transit','transport_requests','delivery_tariffs',
    'import_logs','import_log_rows','feedback','pilot_tasks','clients'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema='public' AND table_name=t
    ) THEN
      EXECUTE format('DROP POLICY IF EXISTS %I_company_isolation ON public.%I', t, t);
      EXECUTE format(
        'CREATE POLICY %I_company_isolation ON public.%I
           AS RESTRICTIVE
           FOR ALL
           TO authenticated
           USING (
             company_id IS NULL
             OR public.has_company_access(auth.uid(), company_id)
           )
           WITH CHECK (
             company_id IS NULL
             OR public.has_company_access(auth.uid(), company_id)
           )',
        t, t
      );
    END IF;
  END LOOP;
END $$;

-- 10. Авто-проставление company_id при INSERT (берём дефолтную у пользователя)
CREATE OR REPLACE FUNCTION public.set_company_id_from_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.company_id IS NULL AND auth.uid() IS NOT NULL THEN
    NEW.company_id := public.default_company_id(auth.uid());
  END IF;
  RETURN NEW;
END $$;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'orders','order_items','order_history','order_problem_reports',
    'delivery_reports','delivery_routes','routes','route_points','route_point_actions',
    'route_point_photos','driver_locations','warehouses','products','stock_movements',
    'inbound_shipments','inbound_shipment_items','carriers','drivers','vehicles',
    'supply_requests','supply_in_transit','transport_requests','delivery_tariffs',
    'import_logs','import_log_rows','feedback','pilot_tasks','clients'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema='public' AND table_name=t
    ) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_set_company ON public.%I', t, t);
      EXECUTE format(
        'CREATE TRIGGER trg_%I_set_company
           BEFORE INSERT ON public.%I
           FOR EACH ROW EXECUTE FUNCTION public.set_company_id_from_user()',
        t, t
      );
    END IF;
  END LOOP;
END $$;

-- 11. При создании профиля нового пользователя — добавляем в дефолтную компанию,
--     если ни в одну ещё не входит (для совместимости с handle_new_user)
CREATE OR REPLACE FUNCTION public.ensure_user_has_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.company_members WHERE user_id = NEW.user_id) THEN
    INSERT INTO public.company_members (user_id, company_id, is_default)
    VALUES (NEW.user_id, '00000000-0000-0000-0000-000000000001', true)
    ON CONFLICT DO NOTHING;
  END IF;
  -- Проставляем company_id в самом профиле
  IF NEW.company_id IS NULL THEN
    NEW.company_id := COALESCE(
      public.default_company_id(NEW.user_id),
      '00000000-0000-0000-0000-000000000001'
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_profiles_ensure_company ON public.profiles;
CREATE TRIGGER trg_profiles_ensure_company
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.ensure_user_has_company();

-- 12. updated_at для companies
DROP TRIGGER IF EXISTS trg_companies_updated_at ON public.companies;
CREATE TRIGGER trg_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
