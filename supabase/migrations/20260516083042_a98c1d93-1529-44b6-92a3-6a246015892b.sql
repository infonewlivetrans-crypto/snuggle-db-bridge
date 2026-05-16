-- SECURITY DEFINER RPC для резолва менеджера при импорте маршрутного листа.
-- Позволяет admin/logist/manager найти или создать запись в public.managers,
-- не расширяя общие RLS-политики INSERT/UPDATE для роли manager.

CREATE OR REPLACE FUNCTION public.resolve_manager_for_route_sheet_import(
  p_full_name       text,
  p_normalized_name text,
  p_phone           text,
  p_created_by      uuid
)
RETURNS TABLE (
  id              uuid,
  full_name       text,
  phone           text,
  created_manager boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid           uuid := auth.uid();
  v_id            uuid;
  v_full_name     text;
  v_phone         text;
  v_created       boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.has_role(v_uid, 'admin'::app_role)
    OR public.has_role(v_uid, 'logist'::app_role)
    OR public.has_role(v_uid, 'manager'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_full_name IS NULL OR length(btrim(p_full_name)) = 0 THEN
    RAISE EXCEPTION 'full_name is required' USING ERRCODE = '22023';
  END IF;
  IF p_normalized_name IS NULL OR length(btrim(p_normalized_name)) = 0 THEN
    RAISE EXCEPTION 'normalized_name is required' USING ERRCODE = '22023';
  END IF;

  SELECT m.id, m.full_name, m.phone
    INTO v_id, v_full_name, v_phone
  FROM public.managers m
  WHERE m.normalized_name = p_normalized_name
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    IF (v_phone IS NULL OR length(btrim(v_phone)) = 0)
       AND p_phone IS NOT NULL AND length(btrim(p_phone)) > 0 THEN
      UPDATE public.managers
         SET phone = p_phone
       WHERE id = v_id;
      v_phone := p_phone;
    END IF;
  ELSE
    INSERT INTO public.managers (
      full_name, normalized_name, phone, is_active, status, source, created_by
    ) VALUES (
      p_full_name, p_normalized_name,
      NULLIF(btrim(coalesce(p_phone, '')), ''),
      true, 'active', 'route_sheet', p_created_by
    )
    RETURNING managers.id, managers.full_name, managers.phone
      INTO v_id, v_full_name, v_phone;
    v_created := true;
  END IF;

  id := v_id;
  full_name := v_full_name;
  phone := v_phone;
  created_manager := v_created;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_manager_for_route_sheet_import(text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_manager_for_route_sheet_import(text, text, text, uuid) TO authenticated;