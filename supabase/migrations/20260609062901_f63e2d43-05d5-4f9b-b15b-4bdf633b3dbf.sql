
-- =====================================================
-- Таблица акцептов договора-оферты
-- =====================================================
CREATE TABLE IF NOT EXISTS public.dispatcher_contract_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatcher_carrier_ext_id uuid NOT NULL
    REFERENCES public.dispatcher_carrier_ext(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  contract_type text NOT NULL DEFAULT 'carrier_digital_services_offer',
  contract_version text NOT NULL,
  contract_title text,
  contract_text text,
  commission_rate numeric,
  minimum_fee numeric DEFAULT 500,
  accepted_by_name text,
  accepted_by_phone text,
  accepted_by_email text,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  accepted_ip text,
  accepted_user_agent text,
  source text NOT NULL DEFAULT 'unknown',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.dispatcher_contract_acceptances TO authenticated;
GRANT ALL ON public.dispatcher_contract_acceptances TO service_role;

ALTER TABLE public.dispatcher_contract_acceptances ENABLE ROW LEVEL SECURITY;

-- Админ/диспетчер видят всё
CREATE POLICY "contract_acceptances admin/dispatcher read"
  ON public.dispatcher_contract_acceptances
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher'));

-- Перевозчик видит только акцепты по своей карточке
CREATE POLICY "contract_acceptances carrier read own"
  ON public.dispatcher_contract_acceptances
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.dispatcher_carrier_users u
      WHERE u.user_id = auth.uid()
        AND u.dispatcher_carrier_ext_id = dispatcher_contract_acceptances.dispatcher_carrier_ext_id
        AND u.status = 'active'
    )
  );

CREATE INDEX IF NOT EXISTS dispatcher_contract_acceptances_carrier_idx
  ON public.dispatcher_contract_acceptances(dispatcher_carrier_ext_id, accepted_at DESC);

-- =====================================================
-- Helper: вставка акцепта (SECURITY DEFINER, вызывается из других RPC)
-- =====================================================
CREATE OR REPLACE FUNCTION public._insert_contract_acceptance(
  p_carrier_id uuid,
  p_payload jsonb,
  p_source text,
  p_user_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_commission numeric;
BEGIN
  IF p_carrier_id IS NULL OR p_payload IS NULL THEN
    RETURN NULL;
  END IF;
  IF NOT COALESCE((p_payload->>'accepted')::boolean, false) THEN
    RETURN NULL;
  END IF;

  SELECT commission_rate INTO v_commission
    FROM public.dispatcher_carrier_ext WHERE id = p_carrier_id;

  INSERT INTO public.dispatcher_contract_acceptances(
    dispatcher_carrier_ext_id, user_id,
    contract_type, contract_version, contract_title, contract_text,
    commission_rate, minimum_fee,
    accepted_by_name, accepted_by_phone, accepted_by_email,
    accepted_ip, accepted_user_agent, source
  ) VALUES (
    p_carrier_id,
    p_user_id,
    COALESCE(NULLIF(trim(p_payload->>'contract_type'),''), 'carrier_digital_services_offer'),
    COALESCE(NULLIF(trim(p_payload->>'contract_version'),''), 'unknown'),
    NULLIF(trim(p_payload->>'contract_title'), ''),
    NULLIF(p_payload->>'contract_text', ''),
    COALESCE(v_commission, 0.05),
    COALESCE(NULLIF(p_payload->>'minimum_fee','')::numeric, 500),
    NULLIF(trim(p_payload->>'accepted_by_name'), ''),
    NULLIF(trim(p_payload->>'accepted_by_phone'), ''),
    NULLIF(trim(p_payload->>'accepted_by_email'), ''),
    NULLIF(trim(p_payload->>'accepted_ip'), ''),
    NULLIF(trim(p_payload->>'accepted_user_agent'), ''),
    p_source
  ) RETURNING id INTO v_id;

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public._insert_contract_acceptance(uuid, jsonb, text, uuid) FROM PUBLIC;

-- =====================================================
-- RPC для авторизованного перевозчика (carrier_activate / admin_manual)
-- =====================================================
CREATE OR REPLACE FUNCTION public.record_carrier_offer_acceptance(
  p_dispatcher_carrier_ext_id uuid,
  p_payload jsonb,
  p_source text DEFAULT 'carrier_activate'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_linked boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.dispatcher_carrier_users
    WHERE user_id = v_uid
      AND dispatcher_carrier_ext_id = p_dispatcher_carrier_ext_id
      AND status = 'active'
  ) INTO v_linked;

  -- Админ/диспетчер тоже могут (admin_manual)
  IF NOT v_linked AND NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'dispatcher')) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  v_id := public._insert_contract_acceptance(
    p_dispatcher_carrier_ext_id,
    p_payload,
    COALESCE(NULLIF(trim(p_source), ''), 'carrier_activate'),
    v_uid
  );

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_accepted');
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;

REVOKE ALL ON FUNCTION public.record_carrier_offer_acceptance(uuid, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_carrier_offer_acceptance(uuid, jsonb, text) TO authenticated;

-- =====================================================
-- Расширение dispatcher_join_submit (сохранение акцепта)
-- =====================================================
CREATE OR REPLACE FUNCTION public.dispatcher_join_submit(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text;
  v_carrier_data jsonb;
  v_driver_data jsonb;
  v_vehicle_data jsonb;
  v_agreement jsonb;
  v_offer jsonb;
  v_carrier_id uuid;
  v_driver_id uuid;
  v_vehicle_id uuid;
  v_task_title text;
  v_related_type text;
  v_related_id uuid;
  v_carrier_kind text;
  v_load_methods text[];
  v_ready_to_cities text[];
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_payload');
  END IF;

  v_type := coalesce(p_payload->>'registration_type', '');
  IF v_type NOT IN ('carrier', 'driver', 'driver_with_vehicle', 'carrier_full') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_registration_type');
  END IF;

  v_carrier_data  := coalesce(p_payload->'carrier', '{}'::jsonb);
  v_driver_data   := coalesce(p_payload->'driver',  '{}'::jsonb);
  v_vehicle_data  := coalesce(p_payload->'vehicle', '{}'::jsonb);
  v_agreement     := coalesce(p_payload->'agreement', '{}'::jsonb);
  v_offer         := coalesce(p_payload->'offer_acceptance', '{}'::jsonb);

  IF v_type IN ('carrier', 'carrier_full') THEN
    IF coalesce((v_agreement->>'agreed')::boolean, false) <> true
       OR coalesce(length(trim(coalesce(v_agreement->>'agreed_by',''))),0) = 0 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'agreement_required');
    END IF;

    -- Дополнительно требуем акцепт договора-оферты
    IF coalesce((v_offer->>'accepted')::boolean, false) <> true
       OR coalesce(length(trim(coalesce(v_offer->>'accepted_by_name',''))),0) = 0 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'offer_required');
    END IF;

    v_carrier_kind := coalesce(v_carrier_data->>'carrier_kind', 'individual');
    IF v_carrier_kind NOT IN ('ip','ooo','self_employed','individual') THEN
      v_carrier_kind := 'individual';
    END IF;

    INSERT INTO public.dispatcher_carrier_ext (
      name, carrier_kind, inn, ogrn, phone, email, city,
      whatsapp, telegram, max_messenger,
      bank_name, bank_account, bank_bik, bank_corr_account,
      payment_method, commission_payment_method,
      commission_rate, commission_agreed,
      commission_agreed_at, commission_agreed_by, commission_agreement_text,
      verification_status, dispatcher_comment
    ) VALUES (
      nullif(trim(coalesce(v_carrier_data->>'name','')), ''),
      v_carrier_kind,
      nullif(trim(coalesce(v_carrier_data->>'inn','')), ''),
      nullif(trim(coalesce(v_carrier_data->>'ogrn','')), ''),
      nullif(trim(coalesce(v_carrier_data->>'phone','')), ''),
      nullif(trim(coalesce(v_carrier_data->>'email','')), ''),
      nullif(trim(coalesce(v_carrier_data->>'city','')), ''),
      nullif(trim(coalesce(v_carrier_data->>'whatsapp','')), ''),
      nullif(trim(coalesce(v_carrier_data->>'telegram','')), ''),
      nullif(trim(coalesce(v_carrier_data->>'max_messenger','')), ''),
      nullif(trim(coalesce(v_carrier_data->>'bank_name','')), ''),
      nullif(trim(coalesce(v_carrier_data->>'bank_account','')), ''),
      nullif(trim(coalesce(v_carrier_data->>'bank_bik','')), ''),
      nullif(trim(coalesce(v_carrier_data->>'bank_corr_account','')), ''),
      nullif(trim(coalesce(v_carrier_data->>'payment_method','')), ''),
      nullif(trim(coalesce(v_carrier_data->>'commission_payment_method','')), ''),
      0.05,
      true,
      now(),
      trim(v_agreement->>'agreed_by'),
      coalesce(v_agreement->>'agreement_text', 'Комиссия 5% после получения оплаты за перевозку'),
      'on_check',
      'Регистрация через публичную ссылку /dispatcher/join'
    )
    RETURNING id INTO v_carrier_id;

    -- Записываем акцепт договора
    PERFORM public._insert_contract_acceptance(
      v_carrier_id, v_offer, 'dispatcher_join', NULL
    );
  END IF;

  IF v_type IN ('driver', 'driver_with_vehicle', 'carrier_full') THEN
    INSERT INTO public.dispatcher_driver_ext (
      full_name, phone, email, whatsapp, telegram, max_messenger,
      city, dispatcher_status, docs_verified, docs_status,
      dispatcher_carrier_ext_id, dispatcher_comment
    ) VALUES (
      nullif(trim(coalesce(v_driver_data->>'full_name','')), ''),
      nullif(trim(coalesce(v_driver_data->>'phone','')), ''),
      nullif(trim(coalesce(v_driver_data->>'email','')), ''),
      nullif(trim(coalesce(v_driver_data->>'whatsapp','')), ''),
      nullif(trim(coalesce(v_driver_data->>'telegram','')), ''),
      nullif(trim(coalesce(v_driver_data->>'max_messenger','')), ''),
      nullif(trim(coalesce(v_driver_data->>'city','')), ''),
      'docs_unchecked',
      false,
      'not_uploaded',
      v_carrier_id,
      nullif(trim(coalesce(v_driver_data->>'dispatcher_comment','')), '')
    )
    RETURNING id INTO v_driver_id;
  END IF;

  IF v_type IN ('driver_with_vehicle', 'carrier_full') THEN
    BEGIN
      v_load_methods := ARRAY(SELECT jsonb_array_elements_text(v_vehicle_data->'load_methods'));
    EXCEPTION WHEN others THEN
      v_load_methods := NULL;
    END;
    BEGIN
      v_ready_to_cities := ARRAY(SELECT jsonb_array_elements_text(v_vehicle_data->'ready_to_cities'));
    EXCEPTION WHEN others THEN
      v_ready_to_cities := NULL;
    END;

    INSERT INTO public.dispatcher_vehicle_ext (
      vehicle_kind, body_type, payload_kg, volume_m3,
      length_m, width_m, height_m,
      load_methods, home_city, ready_to_cities, ready_date,
      minimum_trip_rate, minimum_km_rate, city_rate, point_rate, rate_comment,
      dispatcher_driver_ext_id, dispatcher_carrier_ext_id,
      dispatcher_status, docs_status, dispatcher_comment
    ) VALUES (
      nullif(trim(coalesce(v_vehicle_data->>'vehicle_kind','')), ''),
      nullif(trim(coalesce(v_vehicle_data->>'body_type','')), ''),
      nullif((v_vehicle_data->>'payload_kg'),'')::numeric,
      nullif((v_vehicle_data->>'volume_m3'),'')::numeric,
      nullif((v_vehicle_data->>'length_m'),'')::numeric,
      nullif((v_vehicle_data->>'width_m'),'')::numeric,
      nullif((v_vehicle_data->>'height_m'),'')::numeric,
      v_load_methods,
      nullif(trim(coalesce(v_vehicle_data->>'home_city','')), ''),
      v_ready_to_cities,
      nullif((v_vehicle_data->>'ready_date'),'')::date,
      nullif((v_vehicle_data->>'minimum_trip_rate'),'')::numeric,
      nullif((v_vehicle_data->>'minimum_km_rate'),'')::numeric,
      nullif((v_vehicle_data->>'city_rate'),'')::numeric,
      nullif((v_vehicle_data->>'point_rate'),'')::numeric,
      nullif(trim(coalesce(v_vehicle_data->>'rate_comment','')), ''),
      v_driver_id,
      v_carrier_id,
      'docs_unchecked',
      'not_uploaded',
      nullif(trim(coalesce(v_vehicle_data->>'dispatcher_comment','')), '')
    )
    RETURNING id INTO v_vehicle_id;
  END IF;

  IF v_carrier_id IS NOT NULL THEN
    v_task_title := 'Проверить новую анкету перевозчика';
    v_related_type := 'carrier';
    v_related_id := v_carrier_id;
  ELSIF v_driver_id IS NOT NULL THEN
    v_task_title := CASE WHEN v_vehicle_id IS NOT NULL
                        THEN 'Проверить нового водителя со своей машиной'
                        ELSE 'Проверить нового водителя' END;
    v_related_type := 'driver';
    v_related_id := v_driver_id;
  ELSE
    v_task_title := 'Проверить новую анкету';
    v_related_type := NULL;
    v_related_id := NULL;
  END IF;

  INSERT INTO public.dispatcher_tasks (
    task_type, title, description, priority, task_status, due_date,
    related_entity_type, related_entity_id,
    dispatcher_carrier_ext_id, dispatcher_driver_ext_id, dispatcher_vehicle_ext_id
  ) VALUES (
    'check_documents',
    v_task_title,
    'Анкета подана через публичную ссылку /dispatcher/join',
    'high',
    'open',
    current_date,
    v_related_type,
    v_related_id,
    v_carrier_id,
    v_driver_id,
    v_vehicle_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'carrier_id', v_carrier_id,
    'driver_id', v_driver_id,
    'vehicle_id', v_vehicle_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.dispatcher_join_submit(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dispatcher_join_submit(jsonb) TO anon, authenticated, service_role;

-- =====================================================
-- Расширение dispatcher_invite_complete (сохранение акцепта)
-- =====================================================
CREATE OR REPLACE FUNCTION public.dispatcher_invite_complete(p_token text, p_consent jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tok public.dispatcher_invite_tokens%ROWTYPE;
  v_consent_by text;
  v_consent_text text;
  v_offer jsonb;
BEGIN
  SELECT * INTO v_tok FROM public.dispatcher_invite_tokens WHERE token = p_token;
  IF NOT FOUND OR v_tok.revoked_at IS NOT NULL OR v_tok.used_at IS NOT NULL
     OR (v_tok.expires_at IS NOT NULL AND v_tok.expires_at < now()) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_token');
  END IF;

  v_offer := coalesce(p_consent->'offer_acceptance', '{}'::jsonb);

  IF v_tok.related_entity_type = 'carrier' THEN
    v_consent_by := COALESCE(p_consent->>'agreed_by', '');
    v_consent_text := COALESCE(p_consent->>'agreement_text', '');
    IF NOT COALESCE((p_consent->>'agreed')::boolean, false) OR length(v_consent_by) = 0 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'consent_required');
    END IF;
    -- Требуем акцепт договора-оферты
    IF NOT COALESCE((v_offer->>'accepted')::boolean, false)
       OR coalesce(length(trim(coalesce(v_offer->>'accepted_by_name',''))),0) = 0 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'offer_required');
    END IF;
    UPDATE public.dispatcher_carrier_ext
      SET commission_agreed = true,
          commission_agreed_at = now(),
          commission_agreed_by = v_consent_by,
          commission_agreement_text = NULLIF(v_consent_text, ''),
          verification_status = 'on_check'
      WHERE id = v_tok.related_entity_id;

    PERFORM public._insert_contract_acceptance(
      v_tok.related_entity_id, v_offer, 'dispatcher_register_token', NULL
    );
  ELSIF v_tok.related_entity_type = 'driver' THEN
    UPDATE public.dispatcher_driver_ext
      SET dispatcher_status = CASE WHEN dispatcher_status = 'new' THEN 'docs_unchecked' ELSE dispatcher_status END,
          docs_status = CASE WHEN docs_status = 'not_uploaded' THEN 'uploaded' ELSE docs_status END
      WHERE id = v_tok.related_entity_id;
  ELSIF v_tok.related_entity_type = 'vehicle' THEN
    UPDATE public.dispatcher_vehicle_ext
      SET dispatcher_status = CASE WHEN dispatcher_status = 'new' THEN 'docs_unchecked' ELSE dispatcher_status END,
          docs_status = CASE WHEN docs_status = 'not_uploaded' THEN 'uploaded' ELSE docs_status END
      WHERE id = v_tok.related_entity_id;
  END IF;

  UPDATE public.dispatcher_invite_tokens SET used_at = now() WHERE id = v_tok.id;
  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION public.dispatcher_invite_complete(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dispatcher_invite_complete(text, jsonb) TO anon, authenticated;
