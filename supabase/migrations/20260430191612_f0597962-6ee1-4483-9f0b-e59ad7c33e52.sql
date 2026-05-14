
-- Утилита: применить набор политик write/admin к таблице
-- Делаем всё вручную для надёжности

-- =========================================================
-- 1) Универсально дропаем старые "Anyone can ..." политики
-- =========================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
      FROM pg_policies
     WHERE schemaname='public'
       AND policyname LIKE 'Anyone can %'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- =========================================================
-- 2) Хелпер для генерации стандартных политик
--     - SELECT  : всем (public) — сохраняем поведение для /d/$token и интеграций
--     - INSERT/UPDATE/DELETE : только authenticated с нужной ролью (admin всегда)
-- =========================================================

CREATE OR REPLACE FUNCTION public._apply_role_policies(p_table text, p_roles text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_check text;
  v_role text;
  v_parts text[] := ARRAY[]::text[];
BEGIN
  -- admin всегда
  v_parts := array_append(v_parts, $f$has_role(auth.uid(), 'admin'::app_role)$f$);
  FOREACH v_role IN ARRAY p_roles LOOP
    IF v_role <> 'admin' THEN
      v_parts := array_append(v_parts, format($f$has_role(auth.uid(), %L::app_role)$f$, v_role));
    END IF;
  END LOOP;
  v_check := array_to_string(v_parts, ' OR ');

  -- SELECT — всем
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p_table || '_select_all', p_table);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO public USING (true)',
                 p_table || '_select_all', p_table);

  -- INSERT
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p_table || '_insert_role', p_table);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)',
                 p_table || '_insert_role', p_table, v_check);

  -- UPDATE
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p_table || '_update_role', p_table);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
                 p_table || '_update_role', p_table, v_check, v_check);

  -- DELETE
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p_table || '_delete_role', p_table);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (%s)',
                 p_table || '_delete_role', p_table, v_check);
END;
$$;

-- =========================================================
-- 3) Применяем по группам
-- =========================================================

-- Заказы / клиенты / импорт — admin, logist, manager
SELECT public._apply_role_policies('orders',                  ARRAY['logist','manager']);
SELECT public._apply_role_policies('order_items',             ARRAY['logist','manager']);
SELECT public._apply_role_policies('order_history',           ARRAY['logist','manager']);
SELECT public._apply_role_policies('order_problem_reports',   ARRAY['logist','manager','driver']);
SELECT public._apply_role_policies('delivery_reports',        ARRAY['logist','manager','driver']);
SELECT public._apply_role_policies('external_refs',           ARRAY['logist','manager']);
SELECT public._apply_role_policies('clients',                 ARRAY['logist','manager']);
SELECT public._apply_role_policies('import_logs',             ARRAY['logist','manager']);
SELECT public._apply_role_policies('import_log_rows',         ARRAY['logist','manager']);

-- Маршруты — admin, logist (+ driver для отметок точек)
SELECT public._apply_role_policies('routes',                  ARRAY['logist']);
SELECT public._apply_role_policies('route_points',            ARRAY['logist','driver']);
SELECT public._apply_role_policies('route_point_actions',     ARRAY['logist','driver']);
SELECT public._apply_role_policies('route_point_photos',      ARRAY['logist','driver']);
SELECT public._apply_role_policies('route_cost_history',      ARRAY['logist']);
SELECT public._apply_role_policies('delivery_routes',         ARRAY['logist','manager']);
SELECT public._apply_role_policies('delivery_tariffs',        ARRAY['logist']);

-- Перевозчики / водители / транспорт
SELECT public._apply_role_policies('carriers',                ARRAY['logist']);
SELECT public._apply_role_policies('carrier_documents',       ARRAY['logist']);
SELECT public._apply_role_policies('carrier_invites',         ARRAY['logist']);
SELECT public._apply_role_policies('drivers',                 ARRAY['logist']);
SELECT public._apply_role_policies('vehicles',                ARRAY['logist']);
SELECT public._apply_role_policies('driver_locations',        ARRAY['logist','driver']);

-- Заявки на транспорт
SELECT public._apply_role_policies('transport_request_status_history',           ARRAY['logist','manager']);
SELECT public._apply_role_policies('transport_request_warehouse_status_log',     ARRAY['logist','manager','warehouse']);

-- Склад
SELECT public._apply_role_policies('warehouses',              ARRAY['warehouse','logist']);
SELECT public._apply_role_policies('warehouse_dock_events',   ARRAY['warehouse','logist']);
SELECT public._apply_role_policies('warehouse_dock_slots',    ARRAY['warehouse','logist']);
SELECT public._apply_role_policies('warehouse_load_plan',     ARRAY['warehouse','logist']);
SELECT public._apply_role_policies('warehouse_staff',         ARRAY['warehouse','logist']);
SELECT public._apply_role_policies('stock_movements',         ARRAY['warehouse','logist']);
SELECT public._apply_role_policies('stock_reservations',      ARRAY['warehouse','logist']);
SELECT public._apply_role_policies('stock_transfers',         ARRAY['warehouse','logist']);
SELECT public._apply_role_policies('inbound_shipments',       ARRAY['warehouse','logist']);
SELECT public._apply_role_policies('inbound_shipment_items',  ARRAY['warehouse','logist']);
SELECT public._apply_role_policies('dock_loaded_items',       ARRAY['warehouse','logist']);
SELECT public._apply_role_policies('products',                ARRAY['warehouse','logist','supply']);
SELECT public._apply_role_policies('product_stock_settings',  ARRAY['warehouse','logist','supply']);

-- Снабжение
SELECT public._apply_role_policies('supply_requests',                ARRAY['supply']);
SELECT public._apply_role_policies('supply_request_status_history',  ARRAY['supply','warehouse']);
SELECT public._apply_role_policies('supply_in_transit',              ARRAY['supply','warehouse']);
SELECT public._apply_role_policies('supply_notification_log',        ARRAY['supply']);

-- Системные — только admin
SELECT public._apply_role_policies('system_settings', ARRAY[]::text[]);
SELECT public._apply_role_policies('system_issues',   ARRAY[]::text[]);
SELECT public._apply_role_policies('app_versions',    ARRAY[]::text[]);
SELECT public._apply_role_policies('onec_outbound',   ARRAY[]::text[]);

-- Уведомления — пишут все авторизованные (нужны триггерам/клиенту); чтение всем
DROP POLICY IF EXISTS notifications_select_all ON public.notifications;
DROP POLICY IF EXISTS notifications_insert_role ON public.notifications;
DROP POLICY IF EXISTS notifications_update_role ON public.notifications;
DROP POLICY IF EXISTS notifications_delete_role ON public.notifications;
CREATE POLICY notifications_select_all   ON public.notifications FOR SELECT TO public         USING (true);
CREATE POLICY notifications_insert_auth  ON public.notifications FOR INSERT TO authenticated  WITH CHECK (true);
CREATE POLICY notifications_update_auth  ON public.notifications FOR UPDATE TO authenticated  USING (true) WITH CHECK (true);
CREATE POLICY notifications_delete_admin ON public.notifications FOR DELETE TO authenticated  USING (has_role(auth.uid(),'admin'::app_role));

-- Чистим вспомогательную функцию
DROP FUNCTION public._apply_role_policies(text, text[]);
