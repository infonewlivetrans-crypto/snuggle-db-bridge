
CREATE OR REPLACE FUNCTION public.get_order_timeline_for_portal_token(
  _token text,
  _order_id uuid
)
RETURNS TABLE (
  kind text,
  occurred_at timestamptz,
  payload jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ok AS (
    SELECT c.id AS client_id
    FROM public.clients c
    WHERE c.portal_token = _token
      AND c.portal_access_enabled = true
      AND c.portal_token_revoked_at IS NULL
    LIMIT 1
  ),
  allowed AS (
    SELECT o.id
    FROM public.orders o
    JOIN ok ON ok.client_id = o.client_id
    WHERE o.id = _order_id
    LIMIT 1
  ),
  events AS (
    -- order_created: всегда из orders.created_at
    SELECT 'order_created'::text AS kind, o.created_at AS occurred_at, '{}'::jsonb AS payload
    FROM public.orders o
    JOIN allowed a ON a.id = o.id

    UNION ALL

    -- статусные переходы из order_history (field='status')
    SELECT
      CASE
        WHEN h.new_value IN ('in_progress','ready_for_delivery','delivering') THEN 'dispatched'
        WHEN h.new_value = 'delivered' THEN 'delivered'
        WHEN h.new_value = 'not_delivered' THEN 'not_delivered'
        WHEN h.new_value IN ('cancelled','excluded_from_route') THEN 'cancelled'
      END AS kind,
      h.changed_at AS occurred_at,
      '{}'::jsonb AS payload
    FROM public.order_history h
    JOIN allowed a ON a.id = h.order_id
    WHERE h.field = 'status'
      AND h.new_value IN (
        'in_progress','ready_for_delivery','delivering',
        'delivered','not_delivered','cancelled','excluded_from_route'
      )

    UNION ALL

    -- route_points: водитель в пути
    SELECT 'driver_en_route'::text, rp.dp_status_changed_at, '{}'::jsonb
    FROM public.route_points rp
    JOIN allowed a ON a.id = rp.order_id
    WHERE rp.dp_status = 'en_route'
      AND rp.dp_status_changed_at IS NOT NULL

    UNION ALL

    -- route_points: водитель на месте
    SELECT 'driver_arrived'::text, rp.dp_actual_arrival_at, '{}'::jsonb
    FROM public.route_points rp
    JOIN allowed a ON a.id = rp.order_id
    WHERE rp.dp_actual_arrival_at IS NOT NULL

    UNION ALL

    -- route_points: возвращён на склад
    SELECT 'returned_to_warehouse'::text, rp.wh_return_arrived_at, '{}'::jsonb
    FROM public.route_points rp
    JOIN allowed a ON a.id = rp.order_id
    WHERE rp.wh_return_arrived_at IS NOT NULL

    UNION ALL

    -- route_points: принят на складе
    SELECT 'warehouse_accepted'::text, rp.wh_return_accepted_at, '{}'::jsonb
    FROM public.route_points rp
    JOIN allowed a ON a.id = rp.order_id
    WHERE rp.wh_return_accepted_at IS NOT NULL
  ),
  -- Дедупликация: один и тот же kind в пределах минуты схлопываем,
  -- оставляя самое раннее время.
  deduped AS (
    SELECT DISTINCT ON (kind, date_trunc('minute', occurred_at))
      kind, occurred_at, payload
    FROM events
    WHERE kind IS NOT NULL AND occurred_at IS NOT NULL
    ORDER BY kind, date_trunc('minute', occurred_at), occurred_at ASC
  )
  SELECT kind, occurred_at, payload
  FROM deduped
  ORDER BY occurred_at DESC, kind ASC;
$$;

REVOKE ALL ON FUNCTION public.get_order_timeline_for_portal_token(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_timeline_for_portal_token(text, uuid) TO anon, authenticated;
