-- =========================================================================
-- Package 5.5 — Unread client message counters (manager + driver) + trigger
-- =========================================================================

-- A) Staff (admin / logist / manager): unread client messages by order_ids
CREATE OR REPLACE FUNCTION public.get_unread_client_msgs_for_staff(_order_ids uuid[])
RETURNS TABLE (order_id uuid, unread integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_role(v_uid,'admin'::app_role)
    OR public.has_role(v_uid,'logist'::app_role)
    OR public.has_role(v_uid,'manager'::app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF _order_ids IS NULL OR array_length(_order_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT m.order_id, COUNT(*)::integer AS unread
  FROM public.client_order_messages m
  WHERE m.order_id = ANY (_order_ids)
    AND m.read_by_manager_at IS NULL
  GROUP BY m.order_id
  HAVING COUNT(*) > 0;
END;
$$;

-- B) Driver: unread driver-targeted messages by order_ids (admin OR assigned driver)
CREATE OR REPLACE FUNCTION public.get_unread_client_msgs_for_driver(_order_ids uuid[])
RETURNS TABLE (order_id uuid, unread integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  v_is_admin := public.has_role(v_uid,'admin'::app_role);

  IF NOT v_is_admin AND NOT public.has_role(v_uid,'driver'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF _order_ids IS NULL OR array_length(_order_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT m.order_id, COUNT(*)::integer AS unread
  FROM public.client_order_messages m
  WHERE m.order_id = ANY (_order_ids)
    AND m.target_role = 'driver'
    AND m.read_by_driver_at IS NULL
    AND (v_is_admin OR public._driver_can_access_order(v_uid, m.order_id))
  GROUP BY m.order_id
  HAVING COUNT(*) > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.get_unread_client_msgs_for_staff(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_unread_client_msgs_for_driver(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_unread_client_msgs_for_staff(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_unread_client_msgs_for_driver(uuid[]) TO authenticated;

-- =========================================================================
-- Trigger: notify managers when client sends a manager-targeted message
-- (no notification rows for driver-targeted messages)
-- =========================================================================

CREATE OR REPLACE FUNCTION public.tg_notify_manager_on_client_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.target_role = 'manager' THEN
    INSERT INTO public.notifications (kind, title, body, order_id, payload)
    VALUES (
      'client_message_received',
      'Новое сообщение от клиента',
      left(NEW.body, 200),
      NEW.order_id,
      jsonb_build_object('target_role', 'manager')
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_manager_on_client_message
  ON public.client_order_messages;

CREATE TRIGGER trg_notify_manager_on_client_message
AFTER INSERT ON public.client_order_messages
FOR EACH ROW
EXECUTE FUNCTION public.tg_notify_manager_on_client_message();