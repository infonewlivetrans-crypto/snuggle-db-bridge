-- Этап «Практическая работа с ЭПД»: замечания при приёмке Т2,
-- изменения по рейсу и mock QR водителя.

-- 1. edo_document_remarks
CREATE TABLE public.edo_document_remarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.carrier_edo_documents(id) ON DELETE CASCADE,
  carrier_ext_id uuid NOT NULL,
  remark_type text NOT NULL,
  remark_text text NULL,
  severity text NOT NULL DEFAULT 'info',
  quantity_expected numeric NULL,
  quantity_actual numeric NULL,
  weight_expected numeric NULL,
  weight_actual numeric NULL,
  attachments_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid NULL,
  created_by_role text NULL,
  is_training boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX edo_document_remarks_doc_idx ON public.edo_document_remarks(document_id);
CREATE INDEX edo_document_remarks_carrier_idx ON public.edo_document_remarks(carrier_ext_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.edo_document_remarks TO authenticated;
GRANT ALL ON public.edo_document_remarks TO service_role;

ALTER TABLE public.edo_document_remarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "carrier reads own remarks"
  ON public.edo_document_remarks FOR SELECT TO authenticated
  USING (carrier_ext_id = public.carrier_my_ext_id());
CREATE POLICY "carrier inserts own remarks"
  ON public.edo_document_remarks FOR INSERT TO authenticated
  WITH CHECK (carrier_ext_id = public.carrier_my_ext_id());
CREATE POLICY "carrier updates own remarks"
  ON public.edo_document_remarks FOR UPDATE TO authenticated
  USING (carrier_ext_id = public.carrier_my_ext_id())
  WITH CHECK (carrier_ext_id = public.carrier_my_ext_id());
CREATE POLICY "carrier deletes own remarks"
  ON public.edo_document_remarks FOR DELETE TO authenticated
  USING (carrier_ext_id = public.carrier_my_ext_id());
CREATE POLICY "admins manage all remarks"
  ON public.edo_document_remarks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher'));

CREATE TRIGGER edo_document_remarks_set_updated_at
  BEFORE UPDATE ON public.edo_document_remarks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. edo_document_changes
CREATE TABLE public.edo_document_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.carrier_edo_documents(id) ON DELETE CASCADE,
  carrier_ext_id uuid NOT NULL,
  change_type text NOT NULL,
  old_value_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  new_value_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text NULL,
  requested_by uuid NULL,
  requested_by_role text NULL,
  status text NOT NULL DEFAULT 'draft',
  approved_by uuid NULL,
  approved_at timestamptz NULL,
  operator_status text NULL,
  saby_action_hint text NULL,
  is_training boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX edo_document_changes_doc_idx ON public.edo_document_changes(document_id);
CREATE INDEX edo_document_changes_carrier_idx ON public.edo_document_changes(carrier_ext_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.edo_document_changes TO authenticated;
GRANT ALL ON public.edo_document_changes TO service_role;

ALTER TABLE public.edo_document_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "carrier reads own changes"
  ON public.edo_document_changes FOR SELECT TO authenticated
  USING (carrier_ext_id = public.carrier_my_ext_id());
CREATE POLICY "carrier inserts own changes"
  ON public.edo_document_changes FOR INSERT TO authenticated
  WITH CHECK (carrier_ext_id = public.carrier_my_ext_id());
CREATE POLICY "carrier updates own changes"
  ON public.edo_document_changes FOR UPDATE TO authenticated
  USING (carrier_ext_id = public.carrier_my_ext_id())
  WITH CHECK (carrier_ext_id = public.carrier_my_ext_id());
CREATE POLICY "carrier deletes own changes"
  ON public.edo_document_changes FOR DELETE TO authenticated
  USING (carrier_ext_id = public.carrier_my_ext_id());
CREATE POLICY "admins manage all changes"
  ON public.edo_document_changes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher'));

CREATE TRIGGER edo_document_changes_set_updated_at
  BEFORE UPDATE ON public.edo_document_changes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. edo_document_qr_mock
CREATE TABLE public.edo_document_qr_mock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.carrier_edo_documents(id) ON DELETE CASCADE,
  carrier_ext_id uuid NOT NULL,
  trip_id uuid NULL,
  driver_id uuid NULL,
  qr_uid text NOT NULL,
  qr_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  qr_status text NOT NULL DEFAULT 'mock',
  qr_generated_at timestamptz NOT NULL DEFAULT now(),
  qr_cached_at timestamptz NULL,
  qr_offline_available boolean NOT NULL DEFAULT false,
  last_opened_by_driver_at timestamptz NULL,
  is_mock boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX edo_document_qr_mock_doc_uidx ON public.edo_document_qr_mock(document_id);
CREATE INDEX edo_document_qr_mock_driver_idx ON public.edo_document_qr_mock(driver_id);
CREATE INDEX edo_document_qr_mock_trip_idx ON public.edo_document_qr_mock(trip_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.edo_document_qr_mock TO authenticated;
GRANT ALL ON public.edo_document_qr_mock TO service_role;

ALTER TABLE public.edo_document_qr_mock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "carrier reads own qr"
  ON public.edo_document_qr_mock FOR SELECT TO authenticated
  USING (carrier_ext_id = public.carrier_my_ext_id());
CREATE POLICY "carrier inserts own qr"
  ON public.edo_document_qr_mock FOR INSERT TO authenticated
  WITH CHECK (carrier_ext_id = public.carrier_my_ext_id());
CREATE POLICY "carrier updates own qr"
  ON public.edo_document_qr_mock FOR UPDATE TO authenticated
  USING (carrier_ext_id = public.carrier_my_ext_id())
  WITH CHECK (carrier_ext_id = public.carrier_my_ext_id());
CREATE POLICY "driver reads own qr"
  ON public.edo_document_qr_mock FOR SELECT TO authenticated
  USING (driver_id = auth.uid());
CREATE POLICY "driver marks qr opened"
  ON public.edo_document_qr_mock FOR UPDATE TO authenticated
  USING (driver_id = auth.uid())
  WITH CHECK (driver_id = auth.uid());
CREATE POLICY "admins manage all qr"
  ON public.edo_document_qr_mock FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher'));

CREATE TRIGGER edo_document_qr_mock_set_updated_at
  BEFORE UPDATE ON public.edo_document_qr_mock
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Доступ диспетчера/админа к готовности перевозчика (read-only).
CREATE POLICY "dispatcher reads epd readiness"
  ON public.carrier_epd_readiness FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher'));
