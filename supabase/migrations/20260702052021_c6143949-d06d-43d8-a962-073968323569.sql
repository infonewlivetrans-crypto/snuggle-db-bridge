
-- ai_dispatch_agent_sessions
CREATE TABLE IF NOT EXISTS public.ai_dispatch_agent_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatcher_id uuid NOT NULL,
  agent_name text NOT NULL DEFAULT 'Radius Track Browser Agent',
  agent_type text NOT NULL DEFAULT 'mock_agent' CHECK (agent_type IN ('browser_extension','desktop_agent','mock_agent')),
  agent_version text,
  status text NOT NULL DEFAULT 'pairing' CHECK (status IN (
    'pairing','connected','disconnected','opening_site','waiting_user_login',
    'searching','reading_page','refreshing','paused','error','stopped'
  )),
  pairing_code_hash text,
  paired_at timestamptz,
  last_heartbeat_at timestamptz,
  current_task_id uuid,
  browser_name text,
  browser_profile_hint text,
  active_tab_count int NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_dispatch_agent_sessions TO authenticated;
GRANT ALL ON public.ai_dispatch_agent_sessions TO service_role;
ALTER TABLE public.ai_dispatch_agent_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_sessions_owner_or_admin_all"
  ON public.ai_dispatch_agent_sessions FOR ALL
  TO authenticated
  USING (dispatcher_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (dispatcher_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE INDEX IF NOT EXISTS ai_dispatch_agent_sessions_dispatcher_idx
  ON public.ai_dispatch_agent_sessions(dispatcher_id, status);

-- ai_dispatch_agent_commands
CREATE TABLE IF NOT EXISTS public.ai_dispatch_agent_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatcher_id uuid NOT NULL,
  session_id uuid NOT NULL REFERENCES public.ai_dispatch_agent_sessions(id) ON DELETE CASCADE,
  search_task_id uuid,
  candidate_id uuid,
  command_type text NOT NULL CHECK (command_type IN (
    'open_ati','apply_filters','start_search','refresh_page','read_visible_loads',
    'focus_candidate','open_candidate_page','close_candidate_page','close_irrelevant_tabs',
    'pause_search','resume_search','stop_search','heartbeat_check'
  )),
  command_payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued','sent','acknowledged','completed','failed','expired','cancelled'
  )),
  result_json jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  acknowledged_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_dispatch_agent_commands TO authenticated;
GRANT ALL ON public.ai_dispatch_agent_commands TO service_role;
ALTER TABLE public.ai_dispatch_agent_commands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_commands_owner_or_admin_all"
  ON public.ai_dispatch_agent_commands FOR ALL
  TO authenticated
  USING (dispatcher_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (dispatcher_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE INDEX IF NOT EXISTS ai_dispatch_agent_commands_session_status_idx
  ON public.ai_dispatch_agent_commands(session_id, status, created_at);

-- updated_at trigger for sessions
CREATE OR REPLACE FUNCTION public.ai_dispatch_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS ai_dispatch_agent_sessions_touch ON public.ai_dispatch_agent_sessions;
CREATE TRIGGER ai_dispatch_agent_sessions_touch
  BEFORE UPDATE ON public.ai_dispatch_agent_sessions
  FOR EACH ROW EXECUTE FUNCTION public.ai_dispatch_touch_updated_at();
