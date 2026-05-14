
ALTER TABLE public.route_points
  ADD COLUMN IF NOT EXISTS dp_planned_arrival_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dp_actual_arrival_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dp_unload_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dp_unload_finished_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dp_finished_at TIMESTAMPTZ;
