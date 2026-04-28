DO $$ BEGIN
  CREATE TYPE public.transport_request_status AS ENUM (
    'draft',
    'ready_for_planning',
    'needs_review',
    'confirmed',
    'in_progress',
    'completed',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS request_status public.transport_request_status NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS request_status_changed_by text,
  ADD COLUMN IF NOT EXISTS request_status_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS request_status_comment text;

CREATE TABLE IF NOT EXISTS public.transport_request_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL,
  from_status public.transport_request_status,
  to_status public.transport_request_status NOT NULL,
  changed_by text,
  comment text,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trsh_route ON public.transport_request_status_history(route_id, changed_at DESC);

ALTER TABLE public.transport_request_status_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Anyone can view transport_request_status_history"
    ON public.transport_request_status_history FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Anyone can insert transport_request_status_history"
    ON public.transport_request_status_history FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;