CREATE OR REPLACE FUNCTION public.agent_add_to_call_queue(
  _token_hash text,
  _candidate_id uuid,
  _source text DEFAULT NULL,
  _comment text DEFAULT NULL
) RETURNS TABLE(status text, queue_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sid uuid;
  _did uuid;
  _cand_dispatcher uuid;
  _existing uuid;
  _new_id uuid;
BEGIN
  SELECT session_id, dispatcher_id INTO _sid, _did
    FROM public.agent_verify_token(_token_hash);
  IF _sid IS NULL THEN
    RAISE EXCEPTION 'invalid_agent_token';
  END IF;

  INSERT INTO public.ai_dispatch_agent_events(
    dispatcher_id, candidate_id, event_type, message, event_payload
  ) VALUES (
    _did, _candidate_id, 'call_queue_add_requested',
    'Агент запросил добавление кандидата в очередь звонков',
    jsonb_build_object('source', COALESCE(_source, 'agent'))
  );

  SELECT t.dispatcher_id INTO _cand_dispatcher
    FROM public.ai_dispatch_load_candidates c
    JOIN public.ai_dispatch_search_tasks t ON t.id = c.search_task_id
   WHERE c.id = _candidate_id;

  IF _cand_dispatcher IS NULL OR _cand_dispatcher <> _did THEN
    INSERT INTO public.ai_dispatch_agent_events(
      dispatcher_id, candidate_id, event_type, message
    ) VALUES (
      _did, _candidate_id, 'call_queue_add_failed', 'candidate does not belong to dispatcher'
    );
    RAISE EXCEPTION 'invalid_candidate';
  END IF;

  SELECT id INTO _existing
    FROM public.ai_dispatch_call_queue
   WHERE candidate_id = _candidate_id
     AND dispatcher_id = _did
     AND call_status NOT IN ('done', 'cancelled', 'closed', 'archived')
   ORDER BY created_at DESC
   LIMIT 1;

  IF _existing IS NOT NULL THEN
    INSERT INTO public.ai_dispatch_agent_events(
      dispatcher_id, candidate_id, event_type, message
    ) VALUES (
      _did, _candidate_id, 'call_queue_add_completed', 'Кандидат уже в очереди звонков'
    );
    RETURN QUERY SELECT 'already_exists'::text, _existing;
    RETURN;
  END IF;

  INSERT INTO public.ai_dispatch_call_queue(
    dispatcher_id, candidate_id, call_status, priority, dispatcher_comment
  ) VALUES (
    _did, _candidate_id, 'planned', 5, _comment
  ) RETURNING id INTO _new_id;

  INSERT INTO public.ai_dispatch_agent_events(
    dispatcher_id, candidate_id, event_type, message, event_payload
  ) VALUES (
    _did, _candidate_id, 'call_queue_add_completed',
    'Кандидат добавлен в очередь звонков',
    jsonb_build_object('queue_id', _new_id, 'source', COALESCE(_source, 'agent'))
  );

  RETURN QUERY SELECT 'added'::text, _new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.agent_add_to_call_queue(text, uuid, text, text)
  TO anon, authenticated;