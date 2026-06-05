
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

  -- Перевозчик (для carrier и carrier_full): согласие 5% обязательно.
  IF v_type IN ('carrier', 'carrier_full') THEN
    IF coalesce((v_agreement->>'agreed')::boolean, false) <> true
       OR coalesce(length(trim(coalesce(v_agreement->>'agreed_by',''))),0) = 0 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'agreement_required');
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
  END IF;

  -- Водитель (для driver, driver_with_vehicle, carrier_full).
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

  -- Транспорт (для driver_with_vehicle, carrier_full).
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

  -- Задача диспетчеру на проверку.
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
