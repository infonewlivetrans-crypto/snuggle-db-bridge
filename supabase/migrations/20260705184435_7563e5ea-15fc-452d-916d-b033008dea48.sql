
-- Block 3B: harden agent_mark_missing_candidates + reappear detection
CREATE OR REPLACE FUNCTION public.agent_mark_missing_candidates(
  _token_hash text,
  _search_task_id uuid,
  _seen_dedup_keys text[],
  _mark_not_actual_after integer DEFAULT 3,
  _read_success boolean DEFAULT true,
  _read_cycle_started_at timestamptz DEFAULT NULL
) RETURNS TABLE(marked_not_actual integer, warned integer, reappeared integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _sid uuid; _did uuid;
  _marked int := 0;
  _warned int := 0;
  _reappeared int := 0;
  _cycle_ts timestamptz := COALESCE(_read_cycle_started_at, now());
  _closed_statuses text[] := ARRAY['rejected','archived','closed_by_dispatcher','deal_created','confirmed'];
  cand record;
BEGIN
  SELECT session_id, dispatcher_id INTO _sid, _did
    FROM public.agent_verify_token(_token_hash);
  IF _sid IS NULL THEN RAISE EXCEPTION 'invalid_agent_token'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ai_dispatch_search_tasks
     WHERE id = _search_task_id AND dispatcher_id = _did
  ) THEN RAISE EXCEPTION 'task_not_found_or_forbidden'; END IF;

  -- Guard: если чтение выдачи не удалось — ничего не делаем.
  IF NOT _read_success THEN
    RETURN QUERY SELECT 0, 0, 0;
    RETURN;
  END IF;

  -- Reappeared: те, что были в missing (>0) или not_actual/missing_from_page и снова видны.
  FOR cand IN
    SELECT id, status, missing_seen_count, not_actual_reason
      FROM public.ai_dispatch_load_candidates
     WHERE search_task_id = _search_task_id
       AND dedup_key IS NOT NULL
       AND dedup_key = ANY(COALESCE(_seen_dedup_keys, ARRAY[]::text[]))
       AND (missing_seen_count > 0
            OR (status = 'not_actual' AND not_actual_reason = 'missing_from_page'))
  LOOP
    IF cand.status = ANY(_closed_statuses) THEN
      -- вручную закрытые — только обновим last_seen_at и предупредим один раз.
      INSERT INTO public.ai_dispatch_agent_events(
        dispatcher_id, search_task_id, candidate_id, event_type, message, event_payload)
      VALUES (_did, _search_task_id, cand.id, 'candidate_reappeared_but_closed',
              'Груз снова появился, но был закрыт диспетчером',
              jsonb_build_object('previous_status', cand.status));
    ELSE
      UPDATE public.ai_dispatch_load_candidates
         SET missing_seen_count = 0,
             last_missing_at = NULL,
             not_actual_reason = CASE
               WHEN not_actual_reason = 'missing_from_page' THEN NULL
               ELSE not_actual_reason END,
             status = CASE
               WHEN status = 'not_actual' AND not_actual_reason = 'missing_from_page' THEN 'new'
               ELSE status END
       WHERE id = cand.id;

      INSERT INTO public.ai_dispatch_agent_events(
        dispatcher_id, search_task_id, candidate_id, event_type, message, event_payload)
      VALUES (_did, _search_task_id, cand.id, 'candidate_reappeared',
              'Груз снова появился в выдаче',
              jsonb_build_object(
                'previous_missing_seen_count', cand.missing_seen_count,
                'previous_status', cand.status,
                'reappeared_at', now()));
      _reappeared := _reappeared + 1;
    END IF;
  END LOOP;

  -- Обычный сброс для всех остальных увиденных (не тронуто выше).
  UPDATE public.ai_dispatch_load_candidates
     SET missing_seen_count = 0,
         last_seen_at = now(),
         seen_count = COALESCE(seen_count, 0) + 1
   WHERE search_task_id = _search_task_id
     AND dedup_key IS NOT NULL
     AND dedup_key = ANY(COALESCE(_seen_dedup_keys, ARRAY[]::text[]))
     AND NOT (status = ANY(_closed_statuses));

  -- Missing++: только для активных статусов, созданных ДО текущего цикла.
  WITH bumped AS (
    UPDATE public.ai_dispatch_load_candidates
       SET missing_seen_count = missing_seen_count + 1,
           last_missing_at    = now()
     WHERE search_task_id = _search_task_id
       AND status IN ('new','watch','suitable','high_match','low_match')
       AND created_at < _cycle_ts
       AND (dedup_key IS NULL OR NOT (dedup_key = ANY(COALESCE(_seen_dedup_keys, ARRAY[]::text[]))))
     RETURNING id, missing_seen_count
  )
  SELECT COUNT(*)::int INTO _warned FROM bumped;

  -- События порогов: missing_once, missing_twice.
  INSERT INTO public.ai_dispatch_agent_events(
    dispatcher_id, search_task_id, candidate_id, event_type, message, event_payload)
  SELECT _did, _search_task_id, c.id,
         CASE c.missing_seen_count
           WHEN 1 THEN 'candidate_missing_once'
           WHEN 2 THEN 'candidate_missing_twice'
         END,
         format('Кандидат пропал (%s)', c.missing_seen_count),
         jsonb_build_object('missing_seen_count', c.missing_seen_count)
    FROM public.ai_dispatch_load_candidates c
   WHERE c.search_task_id = _search_task_id
     AND c.missing_seen_count IN (1, 2)
     AND c.status IN ('new','watch','suitable','high_match','low_match')
     AND NOT EXISTS (
       SELECT 1 FROM public.ai_dispatch_agent_events e
        WHERE e.candidate_id = c.id
          AND e.event_type = CASE c.missing_seen_count
            WHEN 1 THEN 'candidate_missing_once'
            WHEN 2 THEN 'candidate_missing_twice' END
          AND e.created_at > now() - interval '1 hour'
     );

  -- Пометить неактуальными по порогу (только не-закрытые).
  UPDATE public.ai_dispatch_load_candidates
     SET status = 'not_actual',
         not_actual_reason = 'missing_from_page'
   WHERE search_task_id = _search_task_id
     AND status IN ('new','watch','suitable','high_match','low_match')
     AND missing_seen_count >= _mark_not_actual_after;

  GET DIAGNOSTICS _marked = ROW_COUNT;

  IF _marked > 0 THEN
    INSERT INTO public.ai_dispatch_agent_events(dispatcher_id, search_task_id, event_type, message, event_payload)
    VALUES (_did, _search_task_id, 'candidate_became_not_actual',
            format('candidates marked not_actual: %s', _marked),
            jsonb_build_object('count', _marked, 'threshold', _mark_not_actual_after));
  END IF;

  RETURN QUERY SELECT _marked, _warned, _reappeared;
END;
$$;

GRANT EXECUTE ON FUNCTION public.agent_mark_missing_candidates(text, uuid, text[], integer, boolean, timestamptz)
  TO anon, authenticated;
