
ALTER TABLE public.ai_dispatch_load_candidates
  ADD COLUMN IF NOT EXISTS missing_seen_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_missing_at    timestamptz;

CREATE OR REPLACE FUNCTION public.agent_mark_missing_candidates(
  _token_hash text,
  _search_task_id uuid,
  _seen_dedup_keys text[],
  _mark_not_actual_after integer DEFAULT 3
) RETURNS TABLE(marked_not_actual integer, warned integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _sid uuid; _did uuid;
  _marked int := 0;
  _warned int := 0;
BEGIN
  SELECT session_id, dispatcher_id INTO _sid, _did
    FROM public.agent_verify_token(_token_hash);
  IF _sid IS NULL THEN RAISE EXCEPTION 'invalid_agent_token'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ai_dispatch_search_tasks
     WHERE id = _search_task_id AND dispatcher_id = _did
  ) THEN RAISE EXCEPTION 'task_not_found_or_forbidden'; END IF;

  UPDATE public.ai_dispatch_load_candidates
     SET missing_seen_count = 0
   WHERE search_task_id = _search_task_id
     AND dedup_key = ANY(COALESCE(_seen_dedup_keys, ARRAY[]::text[]));

  UPDATE public.ai_dispatch_load_candidates
     SET missing_seen_count = missing_seen_count + 1,
         last_missing_at    = now()
   WHERE search_task_id = _search_task_id
     AND status IN ('new','watch')
     AND (dedup_key IS NULL OR NOT (dedup_key = ANY(COALESCE(_seen_dedup_keys, ARRAY[]::text[]))));

  GET DIAGNOSTICS _warned = ROW_COUNT;

  UPDATE public.ai_dispatch_load_candidates
     SET status = 'not_actual',
         not_actual_reason = 'missing_from_page'
   WHERE search_task_id = _search_task_id
     AND status IN ('new','watch')
     AND missing_seen_count >= _mark_not_actual_after;

  GET DIAGNOSTICS _marked = ROW_COUNT;

  IF _marked > 0 THEN
    INSERT INTO public.ai_dispatch_agent_events(dispatcher_id, search_task_id, event_type, message, payload_json)
    VALUES (_did, _search_task_id, 'candidate_became_not_actual',
            format('candidates marked not_actual: %s', _marked),
            jsonb_build_object('count', _marked, 'threshold', _mark_not_actual_after));
  END IF;

  RETURN QUERY SELECT _marked, _warned;
END;
$$;

GRANT EXECUTE ON FUNCTION public.agent_mark_missing_candidates(text, uuid, text[], integer)
  TO anon, authenticated;
