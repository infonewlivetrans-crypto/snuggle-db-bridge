
CREATE OR REPLACE FUNCTION public.admin_delete_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order RECORD;
  v_payment_received boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.has_role(v_uid, 'admin'::public.app_role)
    OR public.has_role(v_uid, 'logist'::public.app_role)
    OR public.has_role(v_uid, 'manager'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden: insufficient role' USING ERRCODE = '42501';
  END IF;

  SELECT id, order_number, status, payment_status, cash_received, qr_received
    INTO v_order
  FROM public.orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Заказ не найден' USING ERRCODE = 'P0002';
  END IF;

  v_payment_received := COALESCE(v_order.cash_received, false)
    OR COALESCE(v_order.qr_received, false)
    OR v_order.payment_status::text IN ('paid', 'partial');

  IF v_payment_received THEN
    RAISE EXCEPTION 'Нельзя удалить заказ: по нему уже получена оплата.';
  END IF;

  IF v_order.status::text NOT IN ('new', 'cancelled', 'excluded_from_route') THEN
    RAISE EXCEPTION 'Нельзя удалить заказ: он уже в работе или доставке. Сначала отмените заказ.';
  END IF;

  DELETE FROM public.order_items WHERE order_id = p_order_id;
  DELETE FROM public.orders WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'ok', true,
    'deleted_id', p_order_id,
    'order_number', v_order.order_number
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_delete_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_order(uuid) TO authenticated;
