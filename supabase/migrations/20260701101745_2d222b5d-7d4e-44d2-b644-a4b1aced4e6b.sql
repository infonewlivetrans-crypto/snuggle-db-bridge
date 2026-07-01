
-- Extend search tasks with ATI filters and multi-vehicle grouping
ALTER TABLE public.ai_dispatch_search_tasks
  ADD COLUMN IF NOT EXISTS ati_filters_json jsonb,
  ADD COLUMN IF NOT EXISTS multi_vehicle_group_id uuid,
  ADD COLUMN IF NOT EXISTS is_multi_vehicle_member boolean NOT NULL DEFAULT false;

-- Extend candidates
ALTER TABLE public.ai_dispatch_load_candidates
  ADD COLUMN IF NOT EXISTS bundle_id uuid,
  ADD COLUMN IF NOT EXISTS not_actual_reason text,
  ADD COLUMN IF NOT EXISTS agent_tab_id uuid,
  ADD COLUMN IF NOT EXISTS is_main_load boolean NOT NULL DEFAULT false;

-- Bundles
CREATE TABLE IF NOT EXISTS public.ai_dispatch_load_bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatcher_id uuid NOT NULL,
  vehicle_id uuid,
  search_task_id uuid,
  bundle_type text NOT NULL DEFAULT 'single_main',
  status text NOT NULL DEFAULT 'draft',
  total_price numeric,
  total_distance_km numeric,
  total_weight numeric,
  total_volume numeric,
  remaining_weight numeric,
  remaining_volume numeric,
  total_profit numeric,
  total_profit_per_km numeric,
  route_points_json jsonb,
  time_windows_json jsonb,
  risks_json jsonb,
  ai_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_dispatch_load_bundles TO authenticated;
GRANT ALL ON public.ai_dispatch_load_bundles TO service_role;
ALTER TABLE public.ai_dispatch_load_bundles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bundles_own" ON public.ai_dispatch_load_bundles FOR ALL
  USING (dispatcher_id = auth.uid()) WITH CHECK (dispatcher_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_bundles_dispatcher ON public.ai_dispatch_load_bundles(dispatcher_id);

-- Bundle items
CREATE TABLE IF NOT EXISTS public.ai_dispatch_load_bundle_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id uuid NOT NULL REFERENCES public.ai_dispatch_load_bundles(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL,
  item_role text NOT NULL DEFAULT 'main',
  sequence_number integer NOT NULL DEFAULT 1,
  pickup_order integer,
  delivery_order integer,
  detour_km numeric,
  extra_time_minutes integer,
  compatibility_status text NOT NULL DEFAULT 'ok',
  compatibility_warnings_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_dispatch_load_bundle_items TO authenticated;
GRANT ALL ON public.ai_dispatch_load_bundle_items TO service_role;
ALTER TABLE public.ai_dispatch_load_bundle_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bundle_items_own" ON public.ai_dispatch_load_bundle_items FOR ALL
  USING (EXISTS (SELECT 1 FROM public.ai_dispatch_load_bundles b WHERE b.id = bundle_id AND b.dispatcher_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.ai_dispatch_load_bundles b WHERE b.id = bundle_id AND b.dispatcher_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_bundle_items_bundle ON public.ai_dispatch_load_bundle_items(bundle_id);

-- Call queue
CREATE TABLE IF NOT EXISTS public.ai_dispatch_call_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatcher_id uuid NOT NULL,
  candidate_id uuid,
  bundle_id uuid,
  priority integer NOT NULL DEFAULT 100,
  call_status text NOT NULL DEFAULT 'pending',
  call_result text,
  next_action_at timestamptz,
  dispatcher_comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_dispatch_call_queue TO authenticated;
GRANT ALL ON public.ai_dispatch_call_queue TO service_role;
ALTER TABLE public.ai_dispatch_call_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "call_queue_own" ON public.ai_dispatch_call_queue FOR ALL
  USING (dispatcher_id = auth.uid()) WITH CHECK (dispatcher_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_call_queue_dispatcher ON public.ai_dispatch_call_queue(dispatcher_id);

-- Agent tabs
CREATE TABLE IF NOT EXISTS public.ai_dispatch_agent_tabs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatcher_id uuid NOT NULL,
  session_id uuid,
  search_task_id uuid,
  candidate_id uuid,
  tab_type text NOT NULL DEFAULT 'search_page',
  tab_status text NOT NULL DEFAULT 'opening',
  url text,
  title text,
  opened_at timestamptz DEFAULT now(),
  last_active_at timestamptz,
  closed_at timestamptz,
  close_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_dispatch_agent_tabs TO authenticated;
GRANT ALL ON public.ai_dispatch_agent_tabs TO service_role;
ALTER TABLE public.ai_dispatch_agent_tabs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent_tabs_own" ON public.ai_dispatch_agent_tabs FOR ALL
  USING (dispatcher_id = auth.uid()) WITH CHECK (dispatcher_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_agent_tabs_dispatcher ON public.ai_dispatch_agent_tabs(dispatcher_id);

-- updated_at triggers
CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_bundles_updated ON public.ai_dispatch_load_bundles;
CREATE TRIGGER trg_bundles_updated BEFORE UPDATE ON public.ai_dispatch_load_bundles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_bundle_items_updated ON public.ai_dispatch_load_bundle_items;
CREATE TRIGGER trg_bundle_items_updated BEFORE UPDATE ON public.ai_dispatch_load_bundle_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_call_queue_updated ON public.ai_dispatch_call_queue;
CREATE TRIGGER trg_call_queue_updated BEFORE UPDATE ON public.ai_dispatch_call_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_agent_tabs_updated ON public.ai_dispatch_agent_tabs;
CREATE TRIGGER trg_agent_tabs_updated BEFORE UPDATE ON public.ai_dispatch_agent_tabs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
