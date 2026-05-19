CREATE OR REPLACE FUNCTION public.driver_update_order_payment(
  p_order_id uuid,
  p_cash_received boolean DEFAULT NULL,
  p_qr_received boolean DEFAULT NULL,
  p_payment_status text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  cash_received boolean,
  qr_received boolean,
  payment_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_driver_id uuid;
  v_allowed boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT d.id INTO v_driver_id
  FROM public.drivers d
  WHERE d.user_id = v_uid
  LIMIT 1;

  IF v_driver_id IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.route_points rp
    JOIN public.delivery_routes dr
      ON dr.id = rp.route_id OR dr.source_request_id = rp.route_id
    WHERE rp.order_id = p_order_id
      AND dr.driver_id = v_driver_id
  ) INTO v_allowed;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.orders o
  SET
    cash_received  = COALESCE(p_cash_received,  o.cash_received),
    qr_received    = COALESCE(p_qr_received,    o.qr_received),
    payment_status = COALESCE(p_payment_status, o.payment_status)
  WHERE o.id = p_order_id;

  RETURN QUERY
  SELECT o.id, o.cash_received, o.qr_received, o.payment_status
  FROM public.orders o
  WHERE o.id = p_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.driver_update_order_payment(uuid, boolean, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.driver_update_order_payment(uuid, boolean, boolean, text) TO authenticated;