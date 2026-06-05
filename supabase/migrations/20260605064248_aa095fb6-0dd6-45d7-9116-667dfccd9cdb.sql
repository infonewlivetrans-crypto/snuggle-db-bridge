
-- ============================================================
-- AI-диспетчер: расширения и новые таблицы
-- Все новые таблицы префиксованы dispatcher_*.
-- Доступ — только admin и dispatcher через has_role().
-- ============================================================

-- Хелпер обновления updated_at — используем существующий public.update_updated_at_column
-- (он уже создан в проекте; на всякий случай задаём идемпотентно).
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- ---------- 1) Расширение перевозчиков для диспетчера ----------
CREATE TABLE IF NOT EXISTS public.dispatcher_carrier_ext (
  carrier_id uuid PRIMARY KEY REFERENCES public.carriers(id) ON DELETE CASCADE,
  payment_method text,
  commission_agreed boolean NOT NULL DEFAULT false,
  verification_status text NOT NULL DEFAULT 'new',
  dispatcher_comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispatcher_carrier_ext TO authenticated;
GRANT ALL ON public.dispatcher_carrier_ext TO service_role;
ALTER TABLE public.dispatcher_carrier_ext ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dispatcher_carrier_ext read" ON public.dispatcher_carrier_ext
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher'));
CREATE POLICY "dispatcher_carrier_ext write" ON public.dispatcher_carrier_ext
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher'));
CREATE TRIGGER dispatcher_carrier_ext_set_updated_at
  BEFORE UPDATE ON public.dispatcher_carrier_ext
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 2) Расширение водителей для диспетчера ----------
CREATE TABLE IF NOT EXISTS public.dispatcher_driver_ext (
  driver_id uuid PRIMARY KEY REFERENCES public.drivers(id) ON DELETE CASCADE,
  city text,
  dispatcher_status text NOT NULL DEFAULT 'free',
  dispatcher_comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dispatcher_driver_status_chk
    CHECK (dispatcher_status IN ('free', 'on_trip', 'inactive'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispatcher_driver_ext TO authenticated;
GRANT ALL ON public.dispatcher_driver_ext TO service_role;
ALTER TABLE public.dispatcher_driver_ext ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dispatcher_driver_ext read" ON public.dispatcher_driver_ext
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher'));
CREATE POLICY "dispatcher_driver_ext write" ON public.dispatcher_driver_ext
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher'));
CREATE TRIGGER dispatcher_driver_ext_set_updated_at
  BEFORE UPDATE ON public.dispatcher_driver_ext
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 3) Расширение транспорта для диспетчера ----------
CREATE TABLE IF NOT EXISTS public.dispatcher_vehicle_ext (
  vehicle_id uuid PRIMARY KEY REFERENCES public.vehicles(id) ON DELETE CASCADE,
  ready_city text,
  ready_date date,
  min_rate numeric(12,2),
  dispatcher_status text NOT NULL DEFAULT 'available',
  dispatcher_comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dispatcher_vehicle_status_chk
    CHECK (dispatcher_status IN ('available', 'on_trip', 'inactive'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispatcher_vehicle_ext TO authenticated;
GRANT ALL ON public.dispatcher_vehicle_ext TO service_role;
ALTER TABLE public.dispatcher_vehicle_ext ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dispatcher_vehicle_ext read" ON public.dispatcher_vehicle_ext
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher'));
CREATE POLICY "dispatcher_vehicle_ext write" ON public.dispatcher_vehicle_ext
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher'));
CREATE TRIGGER dispatcher_vehicle_ext_set_updated_at
  BEFORE UPDATE ON public.dispatcher_vehicle_ext
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 4) Найденные грузы ----------
CREATE TABLE IF NOT EXISTS public.dispatcher_freights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_city text,
  to_city text,
  load_date date,
  unload_date date,
  weight_kg numeric(12,2),
  volume_m3 numeric(12,2),
  body_type text,
  loading_method text,
  rate numeric(12,2),
  source text,
  contact text,
  payment_term text,
  is_addon boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'new',
  comment text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dispatcher_freight_status_chk
    CHECK (status IN ('new','match','no_match','in_progress','taken','rejected','archive'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispatcher_freights TO authenticated;
GRANT ALL ON public.dispatcher_freights TO service_role;
ALTER TABLE public.dispatcher_freights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dispatcher_freights read" ON public.dispatcher_freights
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher'));
CREATE POLICY "dispatcher_freights write" ON public.dispatcher_freights
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher'));
CREATE TRIGGER dispatcher_freights_set_updated_at
  BEFORE UPDATE ON public.dispatcher_freights
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS dispatcher_freights_status_idx ON public.dispatcher_freights(status);
CREATE INDEX IF NOT EXISTS dispatcher_freights_load_date_idx ON public.dispatcher_freights(load_date);

-- ---------- 5) Сделки / рейсы (с авто-расчётом комиссии 5%) ----------
CREATE TABLE IF NOT EXISTS public.dispatcher_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_id uuid REFERENCES public.carriers(id) ON DELETE SET NULL,
  driver_id uuid REFERENCES public.drivers(id) ON DELETE SET NULL,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  main_freight_id uuid REFERENCES public.dispatcher_freights(id) ON DELETE SET NULL,
  addon_freight_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  total_rate numeric(12,2) NOT NULL DEFAULT 0,
  commission_rate numeric(5,4) NOT NULL DEFAULT 0.05,
  commission_amount numeric(12,2)
    GENERATED ALWAYS AS (round(coalesce(total_rate,0) * coalesce(commission_rate,0.05), 2)) STORED,
  payment_due date,
  deal_status text NOT NULL DEFAULT 'draft',
  commission_status text NOT NULL DEFAULT 'awaiting_client_payment',
  comment text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dispatcher_deal_status_chk
    CHECK (deal_status IN ('draft','agreed','in_transit','completed','cancelled','dispute')),
  CONSTRAINT dispatcher_commission_status_chk
    CHECK (commission_status IN (
      'awaiting_client_payment','carrier_received','awaiting_commission',
      'paid','overdue','dispute'
    ))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispatcher_deals TO authenticated;
GRANT ALL ON public.dispatcher_deals TO service_role;
ALTER TABLE public.dispatcher_deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dispatcher_deals read" ON public.dispatcher_deals
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher'));
CREATE POLICY "dispatcher_deals write" ON public.dispatcher_deals
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher'));
CREATE TRIGGER dispatcher_deals_set_updated_at
  BEFORE UPDATE ON public.dispatcher_deals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS dispatcher_deals_commission_status_idx ON public.dispatcher_deals(commission_status);
CREATE INDEX IF NOT EXISTS dispatcher_deals_deal_status_idx ON public.dispatcher_deals(deal_status);

-- ---------- 6) Задачи на сегодня ----------
CREATE TABLE IF NOT EXISTS public.dispatcher_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  carrier_id uuid REFERENCES public.carriers(id) ON DELETE SET NULL,
  driver_id uuid REFERENCES public.drivers(id) ON DELETE SET NULL,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  freight_id uuid REFERENCES public.dispatcher_freights(id) ON DELETE SET NULL,
  deal_id uuid REFERENCES public.dispatcher_deals(id) ON DELETE SET NULL,
  due_date date,
  status text NOT NULL DEFAULT 'new',
  priority text NOT NULL DEFAULT 'medium',
  comment text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dispatcher_task_type_chk CHECK (type IN (
    'check_documents','find_freight','find_addon','send_vehicle_data',
    'remind_payment','remind_commission','close_deal','other'
  )),
  CONSTRAINT dispatcher_task_status_chk CHECK (status IN ('new','in_progress','done','cancelled')),
  CONSTRAINT dispatcher_task_priority_chk CHECK (priority IN ('low','medium','high'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispatcher_tasks TO authenticated;
GRANT ALL ON public.dispatcher_tasks TO service_role;
ALTER TABLE public.dispatcher_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dispatcher_tasks read" ON public.dispatcher_tasks
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher'));
CREATE POLICY "dispatcher_tasks write" ON public.dispatcher_tasks
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher'));
CREATE TRIGGER dispatcher_tasks_set_updated_at
  BEFORE UPDATE ON public.dispatcher_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS dispatcher_tasks_status_idx ON public.dispatcher_tasks(status);
CREATE INDEX IF NOT EXISTS dispatcher_tasks_due_date_idx ON public.dispatcher_tasks(due_date);

-- ---------- 7) Дефолтная настройка режима приложения ----------
INSERT INTO public.system_settings (setting_key, setting_value, description)
VALUES ('app.mode', '"radius_track"'::jsonb, 'Режим работы приложения: "radius_track" или "ai_dispatcher"')
ON CONFLICT (setting_key) DO NOTHING;
