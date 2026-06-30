
-- AI Dispatcher: search tasks, load candidates, call logs, agent events

CREATE TABLE public.ai_dispatch_search_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatcher_id uuid NOT NULL,
  search_mode text NOT NULL DEFAULT 'main_load',
  status text NOT NULL DEFAULT 'draft',
  vehicle_source text NOT NULL DEFAULT 'manual_profile',
  vehicle_id uuid,
  driver_id uuid,
  manual_vehicle_json jsonb,
  start_city text,
  start_radius_km integer,
  destination_city text,
  destination_radius_km integer,
  route_points_json jsonb,
  vehicle_params_json jsonb,
  main_load_candidate_id uuid,
  parent_task_id uuid,
  refresh_interval_seconds integer NOT NULL DEFAULT 60,
  last_refresh_at timestamptz,
  next_refresh_at timestamptz,
  refresh_count integer NOT NULL DEFAULT 0,
  loads_seen_count integer NOT NULL DEFAULT 0,
  matched_count integer NOT NULL DEFAULT 0,
  best_candidate_id uuid,
  auto_refresh_enabled boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_dispatch_search_tasks TO authenticated;
GRANT ALL ON public.ai_dispatch_search_tasks TO service_role;
ALTER TABLE public.ai_dispatch_search_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_dispatch_tasks_owner_all" ON public.ai_dispatch_search_tasks
  FOR ALL TO authenticated
  USING (dispatcher_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (dispatcher_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX ai_dispatch_tasks_dispatcher_idx ON public.ai_dispatch_search_tasks(dispatcher_id, status);
CREATE INDEX ai_dispatch_tasks_parent_idx ON public.ai_dispatch_search_tasks(parent_task_id);

-- Candidates
CREATE TABLE public.ai_dispatch_load_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  search_task_id uuid NOT NULL REFERENCES public.ai_dispatch_search_tasks(id) ON DELETE CASCADE,
  source_type text NOT NULL DEFAULT 'ati_site',
  source_name text,
  source_page_url text,
  source_card_anchor text,
  source_row_index integer,
  source_external_ref text,
  agent_open_hint_json jsonb,
  raw_text text,
  parsed_json jsonb,
  pickup_city text,
  delivery_city text,
  pickup_date date,
  delivery_date date,
  cargo_name text,
  weight numeric,
  volume numeric,
  body_type text,
  loading_type text,
  price numeric,
  payment_type text,
  distance_km numeric,
  price_per_km numeric,
  match_score numeric,
  profitability_score numeric,
  risk_score numeric,
  ai_summary text,
  ai_reasons jsonb,
  ai_warnings jsonb,
  is_main_load boolean NOT NULL DEFAULT false,
  is_additional_load boolean NOT NULL DEFAULT false,
  linked_main_candidate_id uuid REFERENCES public.ai_dispatch_load_candidates(id) ON DELETE SET NULL,
  contact_hidden boolean NOT NULL DEFAULT true,
  contact_allowed boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'new',
  dispatcher_decision text,
  dispatcher_comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_dispatch_load_candidates TO authenticated;
GRANT ALL ON public.ai_dispatch_load_candidates TO service_role;
ALTER TABLE public.ai_dispatch_load_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_dispatch_candidates_owner_all" ON public.ai_dispatch_load_candidates
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ai_dispatch_search_tasks t
    WHERE t.id = search_task_id
      AND (t.dispatcher_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.ai_dispatch_search_tasks t
    WHERE t.id = search_task_id
      AND (t.dispatcher_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  ));

CREATE INDEX ai_dispatch_candidates_task_idx ON public.ai_dispatch_load_candidates(search_task_id, status);

-- Call logs
CREATE TABLE public.ai_dispatch_call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.ai_dispatch_load_candidates(id) ON DELETE CASCADE,
  dispatcher_id uuid NOT NULL,
  call_status text NOT NULL DEFAULT 'planned',
  call_result text,
  comment text,
  called_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_dispatch_call_logs TO authenticated;
GRANT ALL ON public.ai_dispatch_call_logs TO service_role;
ALTER TABLE public.ai_dispatch_call_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_dispatch_calls_owner_all" ON public.ai_dispatch_call_logs
  FOR ALL TO authenticated
  USING (dispatcher_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (dispatcher_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX ai_dispatch_calls_candidate_idx ON public.ai_dispatch_call_logs(candidate_id);

-- Agent events
CREATE TABLE public.ai_dispatch_agent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  search_task_id uuid REFERENCES public.ai_dispatch_search_tasks(id) ON DELETE CASCADE,
  candidate_id uuid REFERENCES public.ai_dispatch_load_candidates(id) ON DELETE SET NULL,
  dispatcher_id uuid NOT NULL,
  event_type text NOT NULL,
  event_payload jsonb,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_dispatch_agent_events TO authenticated;
GRANT ALL ON public.ai_dispatch_agent_events TO service_role;
ALTER TABLE public.ai_dispatch_agent_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_dispatch_events_owner_all" ON public.ai_dispatch_agent_events
  FOR ALL TO authenticated
  USING (dispatcher_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (dispatcher_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX ai_dispatch_events_task_idx ON public.ai_dispatch_agent_events(search_task_id, created_at DESC);

-- Trigger to bump updated_at
CREATE OR REPLACE FUNCTION public.ai_dispatch_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER ai_dispatch_tasks_touch BEFORE UPDATE ON public.ai_dispatch_search_tasks
  FOR EACH ROW EXECUTE FUNCTION public.ai_dispatch_touch_updated_at();
CREATE TRIGGER ai_dispatch_candidates_touch BEFORE UPDATE ON public.ai_dispatch_load_candidates
  FOR EACH ROW EXECUTE FUNCTION public.ai_dispatch_touch_updated_at();
CREATE TRIGGER ai_dispatch_calls_touch BEFORE UPDATE ON public.ai_dispatch_call_logs
  FOR EACH ROW EXECUTE FUNCTION public.ai_dispatch_touch_updated_at();
