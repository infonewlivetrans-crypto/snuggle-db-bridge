CREATE OR REPLACE FUNCTION public.vehicle_busy_until(_vehicle_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT MAX(COALESCE(planned_departure_at, route_date::timestamptz) + INTERVAL '8 hours')
  FROM public.routes
  WHERE vehicle_id = _vehicle_id
    AND status IN ('planned', 'in_progress');
$$;