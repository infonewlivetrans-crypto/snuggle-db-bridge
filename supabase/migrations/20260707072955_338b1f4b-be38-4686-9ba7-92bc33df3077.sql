
-- Atomic advance for search orchestration.
-- Prevents duplicate next commands when two callbacks arrive concurrently.
-- SECURITY DEFINER, no service_role. Authorizes caller by token hash.

CREATE OR REPLACE FUNCTION public.agent_advance_orchestration_after_command(
  _token_hash text,
  _command_id uuid,
  _outcome text,
  _result_json jsonb DEFAULT '{}'::jsonb,
  _error_message text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id uuid;
  v_dispatcher_id uuid;
  v_cmd RECORD;
  v_task RECORD;
  v_next_type text;
  v_new_cmd_id uuid;
  v_next_status text;
  v_run_id_in_payload text;
  v_payload jsonb;
BEGIN
  IF _outcome NOT IN ('completed','failed','expired','cancelled','login_required') THEN
    RETURN jsonb_build_object('status','invalid_outcome');
  END IF;

  -- Authorize via existing verify function
  SELECT session_id, dispatcher_id INTO v_session_id, v_dispatcher_id
  FROM public.agent_verify_token(_token_hash) LIMIT 1;
  IF v_session_id IS NULL THEN
    RETURN jsonb_build_object('status','unauthorized');
  END IF;

  -- Load command scoped to this session
  SELECT * INTO v_cmd
  FROM public.ai_dispatch_agent_commands
  WHERE id = _command_id AND session_id = v_session_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','command_not_found');
  END IF;
  IF v_cmd.search_task_id IS NULL THEN
    RETURN jsonb_build_object('status','no_task');
  END IF;

  -- Lock task row
  SELECT * INTO v_task
  FROM public.ai_dispatch_search_tasks
  WHERE id = v_cmd.search_task_id AND dispatcher_id = v_dispatcher_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','task_not_found');
  END IF;

  -- Idempotency: if current command is not this one → already processed
  IF v_task.orchestration_current_command_id IS DISTINCT FROM _command_id THEN
    RETURN jsonb_build_object('status','already_processed',
      'orchestration_status', v_task.orchestration_status);
  END IF;

  -- Stop if task is in terminal/paused state
  IF v_task.orchestration_status IN ('paused','stopped','suitable_found') THEN
    RETURN jsonb_build_object('status','task_not_active',
      'orchestration_status', v_task.orchestration_status);
  END IF;

  -- Stale run_id check
  v_run_id_in_payload := v_cmd.command_payload_json->>'orchestration_run_id';
  IF v_task.orchestration_run_id IS NOT NULL
     AND v_run_id_in_payload IS NOT NULL
     AND v_run_id_in_payload <> v_task.orchestration_run_id::text THEN
    RETURN jsonb_build_object('status','stale_ignored');
  END IF;

  -- Update command status if not already terminal
  IF v_cmd.status NOT IN ('completed','failed','expired','cancelled') THEN
    UPDATE public.ai_dispatch_agent_commands
    SET status = CASE WHEN _outcome = 'login_required' THEN 'completed' ELSE _outcome END,
        result_json = COALESCE(_result_json, result_json),
        error_message = COALESCE(_error_message, error_message),
        completed_at = now()
    WHERE id = _command_id;
  END IF;

  -- Handle outcome
  IF _outcome = 'failed' OR _outcome = 'cancelled' THEN
    UPDATE public.ai_dispatch_search_tasks
    SET orchestration_status = 'failed',
        orchestration_error = COALESCE(_error_message, orchestration_error),
        orchestration_error_code = COALESCE(orchestration_error_code,
          CASE v_cmd.command_type
            WHEN 'open_ati' THEN 'open_ati_failed'
            WHEN 'apply_filters' THEN 'filters_apply_failed'
            WHEN 'start_search' THEN 'search_start_failed'
            WHEN 'read_visible_loads' THEN 'extraction_failed'
            ELSE 'orchestration_failed'
          END),
        orchestration_updated_at = now(),
        orchestration_completed_at = now(),
        orchestration_current_command_id = NULL
    WHERE id = v_task.id;
    RETURN jsonb_build_object('status','ok','orchestration_status','failed');
  END IF;

  IF _outcome = 'expired' THEN
    UPDATE public.ai_dispatch_search_tasks
    SET orchestration_status = 'failed',
        orchestration_error_code = 'agent_timeout',
        orchestration_error = COALESCE(_error_message, 'Команда просрочена'),
        orchestration_updated_at = now(),
        orchestration_completed_at = now(),
        orchestration_current_command_id = NULL
    WHERE id = v_task.id;
    RETURN jsonb_build_object('status','ok','orchestration_status','failed',
      'orchestration_error_code','agent_timeout');
  END IF;

  IF _outcome = 'login_required' THEN
    UPDATE public.ai_dispatch_search_tasks
    SET orchestration_status = 'waiting_user_login',
        orchestration_updated_at = now(),
        orchestration_current_command_id = NULL
    WHERE id = v_task.id;
    RETURN jsonb_build_object('status','ok','orchestration_status','waiting_user_login');
  END IF;

  -- completed → determine next
  v_next_type := CASE v_cmd.command_type
    WHEN 'open_ati' THEN 'apply_filters'
    WHEN 'apply_filters' THEN 'start_search'
    WHEN 'start_search' THEN 'read_visible_loads'
    ELSE NULL
  END;

  IF v_next_type IS NULL THEN
    -- Terminal step of the initial cycle
    UPDATE public.ai_dispatch_search_tasks
    SET orchestration_status = CASE
          WHEN v_cmd.command_type = 'read_visible_loads' THEN 'searching'
          ELSE COALESCE(orchestration_status,'searching')
        END,
        orchestration_updated_at = now(),
        orchestration_current_command_id = NULL
    WHERE id = v_task.id;
    RETURN jsonb_build_object('status','ok',
      'orchestration_status', 'searching');
  END IF;

  v_next_status := CASE v_next_type
    WHEN 'apply_filters' THEN 'applying_filters'
    WHEN 'start_search' THEN 'starting_search'
    WHEN 'read_visible_loads' THEN 'waiting_results'
  END;

  -- Build next payload from previous, preserve orchestration context
  v_payload := COALESCE(v_cmd.command_payload_json, '{}'::jsonb)
    || jsonb_build_object(
      'orchestration_run_id', COALESCE(v_task.orchestration_run_id::text, v_run_id_in_payload),
      'orchestration_step', v_next_type,
      'search_task_id', v_task.id::text
    );

  INSERT INTO public.ai_dispatch_agent_commands(
    dispatcher_id, session_id, search_task_id, command_type, command_payload_json, status, created_at
  ) VALUES (
    v_dispatcher_id, v_session_id, v_task.id, v_next_type, v_payload, 'queued', now()
  ) RETURNING id INTO v_new_cmd_id;

  UPDATE public.ai_dispatch_search_tasks
  SET orchestration_status = v_next_status,
      orchestration_current_command_id = v_new_cmd_id,
      orchestration_updated_at = now()
  WHERE id = v_task.id;

  RETURN jsonb_build_object('status','ok',
    'orchestration_status', v_next_status,
    'next_command_id', v_new_cmd_id,
    'next_command_type', v_next_type);
END;
$$;

GRANT EXECUTE ON FUNCTION public.agent_advance_orchestration_after_command(text,uuid,text,jsonb,text)
  TO anon, authenticated;

-- Resume after ATI login: atomically create apply_filters if waiting.
CREATE OR REPLACE FUNCTION public.agent_resume_after_ati_login(
  _token_hash text,
  _search_task_id uuid,
  _orchestration_run_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id uuid;
  v_dispatcher_id uuid;
  v_task RECORD;
  v_new_cmd_id uuid;
  v_payload jsonb;
BEGIN
  SELECT session_id, dispatcher_id INTO v_session_id, v_dispatcher_id
  FROM public.agent_verify_token(_token_hash) LIMIT 1;
  IF v_session_id IS NULL THEN
    RETURN jsonb_build_object('status','unauthorized');
  END IF;

  SELECT * INTO v_task
  FROM public.ai_dispatch_search_tasks
  WHERE id = _search_task_id AND dispatcher_id = v_dispatcher_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','task_not_found');
  END IF;

  IF v_task.orchestration_status <> 'waiting_user_login' THEN
    RETURN jsonb_build_object('status','already_processed',
      'orchestration_status', v_task.orchestration_status);
  END IF;

  IF v_task.orchestration_run_id IS DISTINCT FROM _orchestration_run_id THEN
    RETURN jsonb_build_object('status','stale_ignored');
  END IF;

  v_payload := jsonb_build_object(
    'orchestration_run_id', v_task.orchestration_run_id::text,
    'orchestration_step', 'apply_filters',
    'search_task_id', v_task.id::text
  );

  INSERT INTO public.ai_dispatch_agent_commands(
    dispatcher_id, session_id, search_task_id, command_type, command_payload_json, status, created_at
  ) VALUES (
    v_dispatcher_id, v_session_id, v_task.id, 'apply_filters', v_payload, 'queued', now()
  ) RETURNING id INTO v_new_cmd_id;

  UPDATE public.ai_dispatch_search_tasks
  SET orchestration_status = 'applying_filters',
      orchestration_current_command_id = v_new_cmd_id,
      orchestration_updated_at = now()
  WHERE id = v_task.id;

  RETURN jsonb_build_object('status','ok',
    'orchestration_status','applying_filters',
    'next_command_id', v_new_cmd_id,
    'next_command_type','apply_filters');
END;
$$;

GRANT EXECUTE ON FUNCTION public.agent_resume_after_ati_login(text,uuid,uuid)
  TO anon, authenticated;
