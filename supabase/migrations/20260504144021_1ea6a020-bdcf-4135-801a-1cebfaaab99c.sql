-- Тип этапа рейса
DO $$ BEGIN
  CREATE TYPE public.trip_stage AS ENUM (
    'not_started',
    'arrived_loading',
    'loaded',
    'departed',
    'in_progress',
    'finished',
    'cash_returned'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Поля кеша на delivery_routes
ALTER TABLE public.delivery_routes
  ADD COLUMN IF NOT EXISTS current_stage public.trip_stage NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS arrived_loading_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS loaded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS departed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cash_returned_at TIMESTAMPTZ;

-- Журнал событий этапов
CREATE TABLE IF NOT EXISTS public.route_stage_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  delivery_route_id UUID NOT NULL REFERENCES public.delivery_routes(id) ON DELETE CASCADE,
  stage public.trip_stage NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_user_id UUID,
  actor_name TEXT,
  comment TEXT,
  gps_lat DOUBLE PRECISION,
  gps_lng DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS route_stage_events_route_idx ON public.route_stage_events(delivery_route_id, occurred_at DESC);

ALTER TABLE public.route_stage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rse_select_authenticated" ON public.route_stage_events;
CREATE POLICY "rse_select_authenticated"
  ON public.route_stage_events FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "rse_insert_authenticated" ON public.route_stage_events;
CREATE POLICY "rse_insert_authenticated"
  ON public.route_stage_events FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Возвраты по рейсу
CREATE TABLE IF NOT EXISTS public.route_returns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  delivery_route_id UUID NOT NULL REFERENCES public.delivery_routes(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  comment TEXT,
  actor_user_id UUID,
  actor_name TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS route_returns_route_idx ON public.route_returns(delivery_route_id, occurred_at DESC);

ALTER TABLE public.route_returns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rret_select_authenticated" ON public.route_returns;
CREATE POLICY "rret_select_authenticated"
  ON public.route_returns FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "rret_insert_authenticated" ON public.route_returns;
CREATE POLICY "rret_insert_authenticated"
  ON public.route_returns FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.route_stage_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.route_returns;