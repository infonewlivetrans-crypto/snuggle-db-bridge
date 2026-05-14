
-- =====================================================
-- 1. Таблица аудита
-- =====================================================
CREATE TABLE IF NOT EXISTS public.audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  user_id      uuid,
  user_name    text,
  user_role    text,
  section      text,             -- orders, routes, warehouse, supply, users, auth, import, ...
  action       text NOT NULL,    -- login, create, update, delete, status_change, photo_upload, ...
  object_type  text,
  object_id    text,
  object_label text,
  old_value    jsonb,
  new_value    jsonb,
  ip_address   text,
  user_agent   text,
  details      jsonb
);

CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON public.audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_user_id_idx    ON public.audit_log (user_id);
CREATE INDEX IF NOT EXISTS audit_log_section_idx    ON public.audit_log (section);
CREATE INDEX IF NOT EXISTS audit_log_action_idx     ON public.audit_log (action);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_log_select_admin_director ON public.audit_log;
CREATE POLICY audit_log_select_admin_director
  ON public.audit_log FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'director'::app_role));

DROP POLICY IF EXISTS audit_log_insert_any_auth ON public.audit_log;
CREATE POLICY audit_log_insert_any_auth
  ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (true);

-- Никаких UPDATE/DELETE, кроме admin
DROP POLICY IF EXISTS audit_log_modify_admin ON public.audit_log;
CREATE POLICY audit_log_modify_admin
  ON public.audit_log FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role));

-- =====================================================
-- 2. Хелпер: безопасно получить текущего пользователя/роли
-- =====================================================
CREATE OR REPLACE FUNCTION public._audit_current_user_info()
RETURNS TABLE(uid uuid, uname text, urole text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_name text;
  v_role text;
BEGIN
  IF v_uid IS NOT NULL THEN
    SELECT full_name INTO v_name FROM public.profiles WHERE user_id = v_uid LIMIT 1;
    SELECT role::text INTO v_role FROM public.user_roles WHERE user_id = v_uid
      ORDER BY CASE role::text
        WHEN 'admin' THEN 1 WHEN 'director' THEN 2 WHEN 'logist' THEN 3
        WHEN 'manager' THEN 4 WHEN 'warehouse' THEN 5 WHEN 'supply' THEN 6
        WHEN 'driver' THEN 7 ELSE 99 END
      LIMIT 1;
  END IF;
  RETURN QUERY SELECT v_uid, v_name, v_role;
END $$;

-- =====================================================
-- 3. Универсальный триггер аудита
--    Конфигурация: TG_ARGV[0] = section, TG_ARGV[1] = label_column (опц.)
-- =====================================================
CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_section text := TG_ARGV[0];
  v_label_col text := COALESCE(NULLIF(TG_ARGV[1], ''), NULL);
  v_action text;
  v_old jsonb;
  v_new jsonb;
  v_id text;
  v_label text;
  v_user RECORD;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'create'; v_old := NULL; v_new := to_jsonb(NEW);
    v_id := COALESCE((to_jsonb(NEW)->>'id'), NULL);
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update'; v_old := to_jsonb(OLD); v_new := to_jsonb(NEW);
    v_id := COALESCE((to_jsonb(NEW)->>'id'), NULL);
    -- частный случай: смена статуса
    IF (v_old->>'status') IS DISTINCT FROM (v_new->>'status') THEN
      v_action := 'status_change';
    END IF;
  ELSE
    v_action := 'delete'; v_old := to_jsonb(OLD); v_new := NULL;
    v_id := COALESCE((to_jsonb(OLD)->>'id'), NULL);
  END IF;

  IF v_label_col IS NOT NULL THEN
    v_label := COALESCE((COALESCE(v_new, v_old))->>v_label_col, NULL);
  END IF;

  SELECT * INTO v_user FROM public._audit_current_user_info();

  INSERT INTO public.audit_log
    (user_id, user_name, user_role, section, action, object_type, object_id, object_label, old_value, new_value)
  VALUES
    (v_user.uid, v_user.uname, v_user.urole, v_section, v_action, TG_TABLE_NAME, v_id, v_label, v_old, v_new);

  RETURN COALESCE(NEW, OLD);
END $$;

-- =====================================================
-- 4. Триггеры на ключевые таблицы
-- =====================================================
DO $$
DECLARE
  r record;
  cfg text[][] := ARRAY[
    ARRAY['orders',                   'orders',     'order_number'],
    ARRAY['routes',                   'routes',     'route_number'],
    ARRAY['delivery_routes',          'routes',     'route_number'],
    ARRAY['route_points',             'routes',     ''],
    ARRAY['route_point_photos',       'routes',     ''],
    ARRAY['stock_movements',          'warehouse',  ''],
    ARRAY['stock_transfers',          'warehouse',  ''],
    ARRAY['inbound_shipments',        'warehouse',  'shipment_number'],
    ARRAY['supply_requests',          'supply',     'request_number'],
    ARRAY['import_logs',              'import',     'file_name'],
    ARRAY['profiles',                 'users',      'full_name'],
    ARRAY['user_roles',               'users',      'role']
  ];
BEGIN
  FOR i IN 1 .. array_length(cfg, 1) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%I ON public.%I', cfg[i][1], cfg[i][1]);
    EXECUTE format(
      'CREATE TRIGGER audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.audit_row_change(%L, %L)',
      cfg[i][1], cfg[i][1], cfg[i][2], cfg[i][3]
    );
  END LOOP;
END $$;
