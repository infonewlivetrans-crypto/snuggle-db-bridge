-- ЭПД-мастер сценариев: таблицы сценариев, готовности перевозчика к ЭПД,
-- статус ГосЛог экспедитора и учебные сессии тренажёра.

-- 1. edo_scenarios
CREATE TABLE public.edo_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_ext_id uuid NOT NULL,
  trip_id uuid NULL,
  deal_id uuid NULL,
  document_id uuid NULL,
  scenario_type text NOT NULL,
  forwarder_id uuid NULL,
  forwarder_possession_mode text NULL,
  cargo_holder_role text NULL,
  required_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  participants_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  signing_plan_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  readiness_status text NOT NULL DEFAULT 'draft',
  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  validation_warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_training boolean NOT NULL DEFAULT false,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX edo_scenarios_carrier_idx ON public.edo_scenarios(carrier_ext_id);
CREATE INDEX edo_scenarios_trip_idx ON public.edo_scenarios(trip_id);
CREATE INDEX edo_scenarios_doc_idx ON public.edo_scenarios(document_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.edo_scenarios TO authenticated;
GRANT ALL ON public.edo_scenarios TO service_role;

ALTER TABLE public.edo_scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "carrier reads own scenarios"
  ON public.edo_scenarios FOR SELECT TO authenticated
  USING (carrier_ext_id = public.carrier_my_ext_id());
CREATE POLICY "carrier inserts own scenarios"
  ON public.edo_scenarios FOR INSERT TO authenticated
  WITH CHECK (carrier_ext_id = public.carrier_my_ext_id());
CREATE POLICY "carrier updates own scenarios"
  ON public.edo_scenarios FOR UPDATE TO authenticated
  USING (carrier_ext_id = public.carrier_my_ext_id())
  WITH CHECK (carrier_ext_id = public.carrier_my_ext_id());
CREATE POLICY "carrier deletes own scenarios"
  ON public.edo_scenarios FOR DELETE TO authenticated
  USING (carrier_ext_id = public.carrier_my_ext_id());
CREATE POLICY "admins manage all scenarios"
  ON public.edo_scenarios FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER edo_scenarios_set_updated_at
  BEFORE UPDATE ON public.edo_scenarios
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. carrier_epd_readiness (одна строка на carrier_ext_id)
CREATE TABLE public.carrier_epd_readiness (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_ext_id uuid NOT NULL UNIQUE,
  edo_operator text NULL,
  has_1c boolean NOT NULL DEFAULT false,
  onec_config text NULL,
  has_1c_edo boolean NOT NULL DEFAULT false,
  has_1c_epd boolean NOT NULL DEFAULT false,
  onec_epd_tariff text NULL,
  edo_participant_id text NULL,
  has_director_kep boolean NOT NULL DEFAULT false,
  has_mchd boolean NOT NULL DEFAULT false,
  responsible_person text NULL,
  driver_has_smartphone boolean NOT NULL DEFAULT false,
  driver_qr_ready boolean NOT NULL DEFAULT false,
  readiness_status text NOT NULL DEFAULT 'not_ready',
  last_checked_at timestamptz NULL,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.carrier_epd_readiness TO authenticated;
GRANT ALL ON public.carrier_epd_readiness TO service_role;

ALTER TABLE public.carrier_epd_readiness ENABLE ROW LEVEL SECURITY;

CREATE POLICY "carrier reads own epd readiness"
  ON public.carrier_epd_readiness FOR SELECT TO authenticated
  USING (carrier_ext_id = public.carrier_my_ext_id());
CREATE POLICY "carrier upserts own epd readiness"
  ON public.carrier_epd_readiness FOR INSERT TO authenticated
  WITH CHECK (carrier_ext_id = public.carrier_my_ext_id());
CREATE POLICY "carrier updates own epd readiness"
  ON public.carrier_epd_readiness FOR UPDATE TO authenticated
  USING (carrier_ext_id = public.carrier_my_ext_id())
  WITH CHECK (carrier_ext_id = public.carrier_my_ext_id());
CREATE POLICY "admins manage all epd readiness"
  ON public.carrier_epd_readiness FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER carrier_epd_readiness_set_updated_at
  BEFORE UPDATE ON public.carrier_epd_readiness
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. forwarder_goslog_status
CREATE TABLE public.forwarder_goslog_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  forwarder_id uuid NULL,
  inn text NULL,
  ogrn text NULL,
  company_name text NULL,
  okved_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  has_okved_5229 boolean NOT NULL DEFAULT false,
  goslog_status text NOT NULL DEFAULT 'unknown',
  registry_number text NULL,
  application_number text NULL,
  application_date date NULL,
  included_at date NULL,
  source_url text NULL,
  verified_by uuid NULL,
  verified_at timestamptz NULL,
  verification_comment text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX forwarder_goslog_inn_idx ON public.forwarder_goslog_status(inn);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.forwarder_goslog_status TO authenticated;
GRANT ALL ON public.forwarder_goslog_status TO service_role;

ALTER TABLE public.forwarder_goslog_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated reads goslog"
  ON public.forwarder_goslog_status FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "admins manage goslog"
  ON public.forwarder_goslog_status FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher'));
CREATE POLICY "forwarder updates own goslog"
  ON public.forwarder_goslog_status FOR UPDATE TO authenticated
  USING (verified_by = auth.uid())
  WITH CHECK (verified_by = auth.uid());
CREATE POLICY "authenticated inserts goslog"
  ON public.forwarder_goslog_status FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE TRIGGER forwarder_goslog_set_updated_at
  BEFORE UPDATE ON public.forwarder_goslog_status
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. edo_training_sessions
CREATE TABLE public.edo_training_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role text NOT NULL,
  scenario_type text NOT NULL,
  current_step integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'in_progress',
  progress_percent integer NOT NULL DEFAULT 0,
  mistakes_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX edo_training_user_idx ON public.edo_training_sessions(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.edo_training_sessions TO authenticated;
GRANT ALL ON public.edo_training_sessions TO service_role;

ALTER TABLE public.edo_training_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user reads own training"
  ON public.edo_training_sessions FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "user inserts own training"
  ON public.edo_training_sessions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "user updates own training"
  ON public.edo_training_sessions FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER edo_training_set_updated_at
  BEFORE UPDATE ON public.edo_training_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Расширение carrier_edo_documents для связи со сценарием и snapshot готовности
ALTER TABLE public.carrier_edo_documents
  ADD COLUMN IF NOT EXISTS scenario_id uuid NULL,
  ADD COLUMN IF NOT EXISTS epd_context_snapshot jsonb NULL,
  ADD COLUMN IF NOT EXISTS is_training boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS carrier_edo_documents_scenario_idx
  ON public.carrier_edo_documents(scenario_id);
