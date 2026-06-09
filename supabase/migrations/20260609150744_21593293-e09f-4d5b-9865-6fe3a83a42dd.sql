CREATE OR REPLACE FUNCTION public.carrier_self_register(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text := lower(trim(coalesce(payload->>'email', '')));
  v_company text := trim(coalesce(payload->>'company_name', ''));
  v_kind text := coalesce(payload->>'carrier_kind', 'self_employed');
  v_carrier_type text;
  v_inn text := nullif(trim(coalesce(payload->>'inn','')), '');
  v_ogrn text := nullif(trim(coalesce(payload->>'ogrn','')), '');
  v_phone text := nullif(trim(coalesce(payload->>'phone','')), '');
  v_city text := nullif(trim(coalesce(payload->>'city','')), '');
  v_contact text := nullif(trim(coalesce(payload->>'contact_person','')), '');
  v_pay_method text := nullif(trim(coalesce(payload->>'commission_payment_method','')), '');
  v_agreed_by text := nullif(trim(coalesce(payload->>'commission_agreed_by','')), '');
  v_reg_type text := coalesce(payload->>'registration_type', 'carrier_only');
  v_driver_name text := nullif(trim(coalesce(payload->>'driver_full_name','')), '');
  v_driver_phone text := nullif(trim(coalesce(payload->>'driver_phone','')), '');
  v_existing_carrier uuid;
  v_carrier_id uuid;
  v_ext_id uuid;
  v_driver_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized');
  END IF;
  IF v_email = '' OR v_company = '' OR v_phone IS NULL OR v_agreed_by IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'validation_failed');
  END IF;

  -- Idempotency: already linked?
  SELECT carrier_id INTO v_existing_carrier
  FROM public.profiles WHERE user_id = v_user_id;
  IF v_existing_carrier IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already_linked', true, 'carrier_id', v_existing_carrier);
  END IF;

  v_carrier_type := CASE v_kind
    WHEN 'ip' THEN 'ip'
    WHEN 'ooo' THEN 'ooo'
    ELSE 'self_employed'
  END;

  INSERT INTO public.carriers (carrier_type, company_name, inn, ogrn, phone, email, city, contact_person, verification_status, source)
  VALUES (v_carrier_type, v_company, v_inn, v_ogrn, v_phone, v_email, v_city, v_contact, 'new', 'carrier_self_register')
  RETURNING id INTO v_carrier_id;

  INSERT INTO public.dispatcher_carrier_ext (
    carrier_id, name, carrier_kind, inn, ogrn, phone, email, city,
    commission_rate, commission_agreed, commission_agreed_at, commission_agreed_by,
    commission_agreement_text, commission_payment_method, verification_status
  ) VALUES (
    v_carrier_id, v_company, v_kind, v_inn, v_ogrn, v_phone, v_email, v_city,
    0.05, true, now(), v_agreed_by,
    'Я подтверждаю, что за рейсы, найденные диспетчером/сервисом, оплачиваю комиссию 5% после получения оплаты за перевозку.',
    v_pay_method, 'new'
  ) RETURNING id INTO v_ext_id;

  INSERT INTO public.profiles (user_id, full_name, email, phone, carrier_id, is_active)
  VALUES (v_user_id, coalesce(v_contact, v_company), v_email, v_phone, v_carrier_id, true)
  ON CONFLICT (user_id) DO UPDATE
    SET carrier_id = EXCLUDED.carrier_id,
        phone = COALESCE(public.profiles.phone, EXCLUDED.phone),
        email = COALESCE(public.profiles.email, EXCLUDED.email),
        is_active = true;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'carrier'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  IF v_reg_type = 'carrier_with_driver' AND v_driver_name IS NOT NULL AND v_driver_phone IS NOT NULL THEN
    INSERT INTO public.drivers (carrier_id, full_name, phone, is_active, source)
    VALUES (v_carrier_id, v_driver_name, v_driver_phone, true, 'carrier_self_register')
    RETURNING id INTO v_driver_id;

    INSERT INTO public.dispatcher_driver_ext (
      driver_id, full_name, phone, city, dispatcher_carrier_ext_id, dispatcher_status, docs_status
    ) VALUES (
      v_driver_id, v_driver_name, v_driver_phone, v_city, v_ext_id, 'new', 'not_uploaded'
    );
  END IF;

  INSERT INTO public.dispatcher_tasks (
    task_type, title, description, priority, task_status,
    related_entity_type, related_entity_id, dispatcher_carrier_ext_id
  ) VALUES (
    'check_documents',
    'Проверить нового перевозчика: ' || v_company,
    'Перевозчик зарегистрировался самостоятельно через /carrier/register. Email: ' || v_email || ', Телефон: ' || coalesce(v_phone,''),
    'normal', 'open', 'carrier', v_carrier_id, v_ext_id
  );

  RETURN jsonb_build_object('ok', true, 'carrier_id', v_carrier_id, 'already_linked', false);
END;
$$;

REVOKE ALL ON FUNCTION public.carrier_self_register(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.carrier_self_register(jsonb) TO authenticated;
