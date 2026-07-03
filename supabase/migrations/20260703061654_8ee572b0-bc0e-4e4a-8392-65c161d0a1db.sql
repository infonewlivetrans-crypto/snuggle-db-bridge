
-- 1. Agent session: token & pairing lifecycle
ALTER TABLE public.ai_dispatch_agent_sessions
  ADD COLUMN IF NOT EXISTS agent_token_hash text,
  ADD COLUMN IF NOT EXISTS agent_token_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS agent_token_last_used_at timestamptz,
  ADD COLUMN IF NOT EXISTS agent_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS pairing_code_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS security_notes text,
  ADD COLUMN IF NOT EXISTS last_action text,
  ADD COLUMN IF NOT EXISTS current_url text;

CREATE INDEX IF NOT EXISTS idx_agent_sessions_token_hash
  ON public.ai_dispatch_agent_sessions(agent_token_hash)
  WHERE agent_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_sessions_pairing_hash
  ON public.ai_dispatch_agent_sessions(pairing_code_hash)
  WHERE pairing_code_hash IS NOT NULL;

-- 2. Load candidates: dedup fields
ALTER TABLE public.ai_dispatch_load_candidates
  ADD COLUMN IF NOT EXISTS dedup_key text,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS seen_count integer NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_load_candidates_dedup
  ON public.ai_dispatch_load_candidates(search_task_id, dedup_key)
  WHERE dedup_key IS NOT NULL;

-- 3. Helper: verify agent bearer token → returns session row (or nothing)
CREATE OR REPLACE FUNCTION public.agent_verify_token(_token_hash text)
RETURNS TABLE(session_id uuid, dispatcher_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, dispatcher_id
  FROM public.ai_dispatch_agent_sessions
  WHERE agent_token_hash = _token_hash
    AND revoked_at IS NULL
    AND (agent_token_expires_at IS NULL OR agent_token_expires_at > now())
  LIMIT 1
$$;

-- 4. Pairing: exchange pairing code hash → set token hash, return session id
CREATE OR REPLACE FUNCTION public.agent_pair(
  _pairing_code_hash text,
  _agent_token_hash text,
  _agent_version text DEFAULT NULL,
  _browser_name text DEFAULT NULL,
  _token_ttl_seconds integer DEFAULT 60*60*24*30
) RETURNS TABLE(session_id uuid, dispatcher_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.ai_dispatch_agent_sessions%ROWTYPE;
BEGIN
  SELECT * INTO _row FROM public.ai_dispatch_agent_sessions
   WHERE pairing_code_hash = _pairing_code_hash
     AND revoked_at IS NULL
     AND (pairing_code_expires_at IS NULL OR pairing_code_expires_at > now())
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_pairing_code' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.ai_dispatch_agent_sessions
     SET agent_token_hash = _agent_token_hash,
         agent_token_created_at = now(),
         agent_token_last_used_at = now(),
         agent_token_expires_at = now() + make_interval(secs => _token_ttl_seconds),
         pairing_code_hash = NULL,
         pairing_code_expires_at = NULL,
         status = 'connected',
         paired_at = COALESCE(paired_at, now()),
         last_heartbeat_at = now(),
         agent_version = COALESCE(_agent_version, agent_version),
         browser_name = COALESCE(_browser_name, browser_name)
   WHERE id = _row.id;

  INSERT INTO public.ai_dispatch_agent_events(dispatcher_id, event_type, message, event_payload)
  VALUES (_row.dispatcher_id, 'agent_connected', 'Agent paired via token', jsonb_build_object('session_id', _row.id));

  RETURN QUERY SELECT _row.id, _row.dispatcher_id;
END;
$$;

-- 5. Heartbeat
CREATE OR REPLACE FUNCTION public.agent_heartbeat(
  _token_hash text,
  _agent_version text DEFAULT NULL,
  _browser_name text DEFAULT NULL,
  _active_tab_count integer DEFAULT NULL,
  _current_url text DEFAULT NULL,
  _current_task_id uuid DEFAULT NULL,
  _status text DEFAULT NULL,
  _last_action text DEFAULT NULL,
  _last_error text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _sid uuid; _did uuid;
BEGIN
  SELECT session_id, dispatcher_id INTO _sid, _did FROM public.agent_verify_token(_token_hash);
  IF _sid IS NULL THEN RAISE EXCEPTION 'invalid_agent_token'; END IF;

  UPDATE public.ai_dispatch_agent_sessions SET
    last_heartbeat_at = now(),
    agent_token_last_used_at = now(),
    agent_version = COALESCE(_agent_version, agent_version),
    browser_name = COALESCE(_browser_name, browser_name),
    active_tab_count = COALESCE(_active_tab_count, active_tab_count),
    current_url = COALESCE(_current_url, current_url),
    current_task_id = COALESCE(_current_task_id, current_task_id),
    status = COALESCE(_status, status),
    last_action = COALESCE(_last_action, last_action),
    last_error = COALESCE(_last_error, last_error)
  WHERE id = _sid;

  INSERT INTO public.ai_dispatch_agent_events(dispatcher_id, event_type, message)
  VALUES (_did, 'agent_heartbeat_received', COALESCE(_last_action, 'heartbeat'));

  RETURN _sid;
END;
$$;

-- 6. Poll commands: returns queued commands and marks them sent
CREATE OR REPLACE FUNCTION public.agent_poll_commands(_token_hash text, _limit integer DEFAULT 20)
RETURNS SETOF public.ai_dispatch_agent_commands
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _sid uuid; _did uuid;
BEGIN
  SELECT session_id, dispatcher_id INTO _sid, _did FROM public.agent_verify_token(_token_hash);
  IF _sid IS NULL THEN RAISE EXCEPTION 'invalid_agent_token'; END IF;

  RETURN QUERY
  WITH picked AS (
    SELECT id FROM public.ai_dispatch_agent_commands
     WHERE session_id = _sid AND status = 'queued'
     ORDER BY created_at ASC
     LIMIT _limit
     FOR UPDATE SKIP LOCKED
  ), upd AS (
    UPDATE public.ai_dispatch_agent_commands c
       SET status = 'sent', sent_at = now()
      FROM picked WHERE c.id = picked.id
    RETURNING c.*
  )
  SELECT * FROM upd;
END;
$$;

CREATE OR REPLACE FUNCTION public.agent_ack_command(_token_hash text, _command_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _sid uuid; _did uuid;
BEGIN
  SELECT session_id, dispatcher_id INTO _sid, _did FROM public.agent_verify_token(_token_hash);
  IF _sid IS NULL THEN RAISE EXCEPTION 'invalid_agent_token'; END IF;
  UPDATE public.ai_dispatch_agent_commands
     SET status = 'acknowledged', acknowledged_at = now()
   WHERE id = _command_id AND session_id = _sid;
  INSERT INTO public.ai_dispatch_agent_events(dispatcher_id, event_type, message, event_payload)
  VALUES (_did, 'command_acknowledged', 'agent ack', jsonb_build_object('command_id', _command_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.agent_complete_command(_token_hash text, _command_id uuid, _result jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _sid uuid; _did uuid;
BEGIN
  SELECT session_id, dispatcher_id INTO _sid, _did FROM public.agent_verify_token(_token_hash);
  IF _sid IS NULL THEN RAISE EXCEPTION 'invalid_agent_token'; END IF;
  UPDATE public.ai_dispatch_agent_commands
     SET status = 'completed', completed_at = now(), result_json = _result
   WHERE id = _command_id AND session_id = _sid;
  INSERT INTO public.ai_dispatch_agent_events(dispatcher_id, event_type, message, event_payload)
  VALUES (_did, 'command_completed', 'agent complete', jsonb_build_object('command_id', _command_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.agent_fail_command(_token_hash text, _command_id uuid, _error text, _result jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _sid uuid; _did uuid;
BEGIN
  SELECT session_id, dispatcher_id INTO _sid, _did FROM public.agent_verify_token(_token_hash);
  IF _sid IS NULL THEN RAISE EXCEPTION 'invalid_agent_token'; END IF;
  UPDATE public.ai_dispatch_agent_commands
     SET status = 'failed', completed_at = now(), error_message = _error, result_json = COALESCE(_result, result_json)
   WHERE id = _command_id AND session_id = _sid;
  INSERT INTO public.ai_dispatch_agent_events(dispatcher_id, event_type, message, event_payload)
  VALUES (_did, 'command_failed', _error, jsonb_build_object('command_id', _command_id));
END;
$$;

-- 7. Agent event logger
CREATE OR REPLACE FUNCTION public.agent_log_event(
  _token_hash text, _event_type text, _message text DEFAULT NULL,
  _search_task_id uuid DEFAULT NULL, _candidate_id uuid DEFAULT NULL, _payload jsonb DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _sid uuid; _did uuid; _eid uuid;
BEGIN
  SELECT session_id, dispatcher_id INTO _sid, _did FROM public.agent_verify_token(_token_hash);
  IF _sid IS NULL THEN RAISE EXCEPTION 'invalid_agent_token'; END IF;
  INSERT INTO public.ai_dispatch_agent_events(dispatcher_id, search_task_id, candidate_id, event_type, message, event_payload)
  VALUES (_did, _search_task_id, _candidate_id, _event_type, _message, COALESCE(_payload,'{}'::jsonb))
  RETURNING id INTO _eid;
  RETURN _eid;
END;
$$;

-- 8. Upsert tabs (single tab, called in loop from server)
CREATE OR REPLACE FUNCTION public.agent_upsert_tab(
  _token_hash text,
  _tab_external_id text,
  _search_task_id uuid,
  _candidate_id uuid,
  _tab_type text,
  _tab_status text,
  _url text,
  _title text,
  _close_reason text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _sid uuid; _did uuid; _tid uuid;
BEGIN
  SELECT session_id, dispatcher_id INTO _sid, _did FROM public.agent_verify_token(_token_hash);
  IF _sid IS NULL THEN RAISE EXCEPTION 'invalid_agent_token'; END IF;

  SELECT id INTO _tid FROM public.ai_dispatch_agent_tabs
   WHERE session_id = _sid AND url = _url LIMIT 1;

  IF _tid IS NULL THEN
    INSERT INTO public.ai_dispatch_agent_tabs(
      dispatcher_id, session_id, search_task_id, candidate_id,
      tab_type, tab_status, url, title, opened_at, last_active_at, close_reason,
      closed_at)
    VALUES (_did, _sid, _search_task_id, _candidate_id,
      COALESCE(_tab_type,'search_page'), COALESCE(_tab_status,'open'), _url, _title,
      now(), now(), _close_reason,
      CASE WHEN _tab_status = 'closed' THEN now() ELSE NULL END)
    RETURNING id INTO _tid;
    INSERT INTO public.ai_dispatch_agent_events(dispatcher_id, session_id, event_type, message)
    VALUES (_did, _sid, 'tab_opened', COALESCE(_url,''));
  ELSE
    UPDATE public.ai_dispatch_agent_tabs SET
      tab_status = COALESCE(_tab_status, tab_status),
      title = COALESCE(_title, title),
      last_active_at = now(),
      close_reason = COALESCE(_close_reason, close_reason),
      closed_at = CASE WHEN _tab_status = 'closed' THEN now() ELSE closed_at END
    WHERE id = _tid;
  END IF;

  RETURN _tid;
END;
$$;

-- 9. Upsert one load from agent (dedup + score bump)
CREATE OR REPLACE FUNCTION public.agent_upsert_load(
  _token_hash text,
  _search_task_id uuid,
  _dedup_key text,
  _payload jsonb
) RETURNS TABLE(candidate_id uuid, was_created boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _sid uuid; _did uuid; _tid uuid; _existing uuid;
BEGIN
  SELECT session_id, dispatcher_id INTO _sid, _did FROM public.agent_verify_token(_token_hash);
  IF _sid IS NULL THEN RAISE EXCEPTION 'invalid_agent_token'; END IF;

  -- Check task belongs to dispatcher
  IF NOT EXISTS (
    SELECT 1 FROM public.ai_dispatch_search_tasks
     WHERE id = _search_task_id AND dispatcher_id = _did
  ) THEN RAISE EXCEPTION 'task_not_found_or_forbidden'; END IF;

  SELECT id INTO _existing FROM public.ai_dispatch_load_candidates
   WHERE search_task_id = _search_task_id AND dedup_key = _dedup_key
   LIMIT 1;

  IF _existing IS NOT NULL THEN
    UPDATE public.ai_dispatch_load_candidates SET
      last_seen_at = now(),
      seen_count = seen_count + 1,
      raw_text = COALESCE(_payload->>'raw_text', raw_text),
      price = COALESCE((_payload->>'price')::numeric, price),
      source_page_url = COALESCE(_payload->>'source_page_url', source_page_url),
      source_card_anchor = COALESCE(_payload->>'source_card_anchor', source_card_anchor),
      agent_open_hint_json = COALESCE(_payload->'agent_open_hint_json', agent_open_hint_json),
      updated_at = now()
    WHERE id = _existing;
    RETURN QUERY SELECT _existing, false;
    RETURN;
  END IF;

  INSERT INTO public.ai_dispatch_load_candidates(
    search_task_id, source_type, source_name, source_page_url, source_card_anchor,
    source_row_index, source_external_ref, agent_open_hint_json,
    raw_text, pickup_city, delivery_city, pickup_date, delivery_date,
    cargo_name, weight, volume, body_type, loading_type, price, payment_type,
    distance_km, dedup_key, last_seen_at, seen_count,
    match_score, profitability_score, risk_score,
    ai_summary, ai_reasons, ai_warnings,
    contact_hidden, status
  ) VALUES (
    _search_task_id, 'browser_agent', 'ati.su',
    _payload->>'source_page_url', _payload->>'source_card_anchor',
    (_payload->>'source_row_index')::int, _payload->>'source_external_ref',
    COALESCE(_payload->'agent_open_hint_json','{}'::jsonb),
    _payload->>'raw_text',
    _payload->>'pickup_city', _payload->>'delivery_city',
    NULLIF(_payload->>'pickup_date','')::date, NULLIF(_payload->>'delivery_date','')::date,
    _payload->>'cargo_name',
    NULLIF(_payload->>'weight','')::numeric, NULLIF(_payload->>'volume','')::numeric,
    _payload->>'body_type', _payload->>'loading_type',
    NULLIF(_payload->>'price','')::numeric, _payload->>'payment_type',
    NULLIF(_payload->>'distance_km','')::numeric,
    _dedup_key, now(), 1,
    COALESCE((_payload->>'match_score')::numeric, 50),
    COALESCE((_payload->>'profitability_score')::numeric, 50),
    COALESCE((_payload->>'risk_score')::numeric, 20),
    _payload->>'ai_summary',
    COALESCE(_payload->'ai_reasons','[]'::jsonb),
    COALESCE(_payload->'ai_warnings','[]'::jsonb),
    true, 'new'
  ) RETURNING id INTO _existing;

  INSERT INTO public.ai_dispatch_agent_events(dispatcher_id, search_task_id, candidate_id, event_type, message)
  VALUES (_did, _search_task_id, _existing, 'load_saved_from_agent', 'candidate from browser agent');

  RETURN QUERY SELECT _existing, true;
END;
$$;

-- 10. Grant execute to authenticated (dispatcher UI calls verify* via server;
--     agent endpoints hit these functions via anon supabase client with hashed token).
GRANT EXECUTE ON FUNCTION public.agent_verify_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_pair(text, text, text, text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_heartbeat(text, text, text, integer, text, uuid, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_poll_commands(text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_ack_command(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_complete_command(text, uuid, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_fail_command(text, uuid, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_log_event(text, text, text, uuid, uuid, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_upsert_tab(text, text, uuid, uuid, text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_upsert_load(text, uuid, text, jsonb) TO anon, authenticated;
