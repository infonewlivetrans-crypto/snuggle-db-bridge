-- Stage 7 (block 1): целевая ставка, поля scoring, dedup сделок, безопасные RPC scoring.
ALTER TABLE public.ai_dispatch_search_tasks
  ADD COLUMN IF NOT EXISTS target_total_price numeric,
  ADD COLUMN IF NOT EXISTS target_price_per_km numeric,
  ADD COLUMN IF NOT EXISTS target_net_profit numeric,
  ADD COLUMN IF NOT EXISTS target_bundle_price numeric,
  ADD COLUMN IF NOT EXISTS max_bundle_items integer DEFAULT 3,
  ADD COLUMN IF NOT EXISTS bundle_search_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS stop_search_when_target_reached boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_price numeric,
  ADD COLUMN IF NOT EXISTS min_price_per_km numeric,
  ADD COLUMN IF NOT EXISTS fuel_consumption_l_per_100km numeric,
  ADD COLUMN IF NOT EXISTS fuel_price_per_l numeric,
  ADD COLUMN IF NOT EXISTS other_expenses numeric,
  ADD COLUMN IF NOT EXISTS commission_percent numeric;

ALTER TABLE public.ai_dispatch_load_candidates
  ADD COLUMN IF NOT EXISTS calculated_profit numeric,
  ADD COLUMN IF NOT EXISTS calculated_price_per_km numeric,
  ADD COLUMN IF NOT EXISTS target_progress_percent numeric,
  ADD COLUMN IF NOT EXISTS target_status text,
  ADD COLUMN IF NOT EXISTS scored_at timestamptz;

ALTER TABLE public.dispatcher_deals
  ADD COLUMN IF NOT EXISTS ai_candidate_id uuid,
  ADD COLUMN IF NOT EXISTS ai_bundle_id uuid,
  ADD COLUMN IF NOT EXISTS ai_search_task_id uuid,
  ADD COLUMN IF NOT EXISTS ai_source text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dispatcher_deals_ai_candidate
  ON public.dispatcher_deals(ai_candidate_id) WHERE ai_candidate_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_dispatcher_deals_ai_bundle
  ON public.dispatcher_deals(ai_bundle_id) WHERE ai_bundle_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.agent_update_candidate_scoring(
  _token_hash text, _candidate_id uuid,
  _match_score numeric, _profitability_score numeric, _risk_score numeric,
  _summary text, _reasons jsonb, _warnings jsonb,
  _calculated_profit numeric, _calculated_price_per_km numeric,
  _target_progress_percent numeric, _target_status text,
  _new_status text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_disp uuid; v_task uuid;
BEGIN
  SELECT dispatcher_id INTO v_disp FROM public.ai_dispatch_agent_sessions
    WHERE agent_token_hash = _token_hash AND revoked_at IS NULL
      AND (agent_token_expires_at IS NULL OR agent_token_expires_at > now())
    LIMIT 1;
  IF v_disp IS NULL THEN RAISE EXCEPTION 'invalid_agent_token'; END IF;
  SELECT c.search_task_id INTO v_task
    FROM public.ai_dispatch_load_candidates c
    JOIN public.ai_dispatch_search_tasks t ON t.id = c.search_task_id
   WHERE c.id = _candidate_id AND t.dispatcher_id = v_disp;
  IF v_task IS NULL THEN RAISE EXCEPTION 'candidate_forbidden'; END IF;
  UPDATE public.ai_dispatch_load_candidates
     SET match_score = _match_score, profitability_score = _profitability_score,
         risk_score = _risk_score,
         ai_summary = COALESCE(_summary, ai_summary),
         ai_reasons = COALESCE(_reasons, ai_reasons),
         ai_warnings = COALESCE(_warnings, ai_warnings),
         calculated_profit = _calculated_profit,
         calculated_price_per_km = _calculated_price_per_km,
         target_progress_percent = _target_progress_percent,
         target_status = _target_status, scored_at = now(),
         status = COALESCE(_new_status, status), updated_at = now()
   WHERE id = _candidate_id;
  RETURN true;
END; $$;

GRANT EXECUTE ON FUNCTION public.agent_update_candidate_scoring(
  text, uuid, numeric, numeric, numeric, text, jsonb, jsonb,
  numeric, numeric, numeric, text, text
) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.agent_update_task_search_result(
  _token_hash text, _task_id uuid,
  _best_candidate_id uuid, _matched_count integer
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_disp uuid; v_own uuid;
BEGIN
  SELECT dispatcher_id INTO v_disp FROM public.ai_dispatch_agent_sessions
    WHERE agent_token_hash = _token_hash AND revoked_at IS NULL
      AND (agent_token_expires_at IS NULL OR agent_token_expires_at > now())
    LIMIT 1;
  IF v_disp IS NULL THEN RAISE EXCEPTION 'invalid_agent_token'; END IF;
  SELECT dispatcher_id INTO v_own FROM public.ai_dispatch_search_tasks WHERE id = _task_id;
  IF v_own IS NULL OR v_own <> v_disp THEN RAISE EXCEPTION 'task_forbidden'; END IF;
  UPDATE public.ai_dispatch_search_tasks
     SET best_candidate_id = COALESCE(_best_candidate_id, best_candidate_id),
         matched_count = GREATEST(COALESCE(matched_count, 0), _matched_count),
         last_refresh_at = now(), updated_at = now()
   WHERE id = _task_id;
  RETURN true;
END; $$;

GRANT EXECUTE ON FUNCTION public.agent_update_task_search_result(text, uuid, uuid, integer)
  TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.agent_get_candidate_scoring_context(
  _token_hash text, _candidate_id uuid
) RETURNS TABLE(candidate jsonb, task jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_disp uuid;
BEGIN
  SELECT dispatcher_id INTO v_disp FROM public.ai_dispatch_agent_sessions
    WHERE agent_token_hash = _token_hash AND revoked_at IS NULL
      AND (agent_token_expires_at IS NULL OR agent_token_expires_at > now())
    LIMIT 1;
  IF v_disp IS NULL THEN RAISE EXCEPTION 'invalid_agent_token'; END IF;
  RETURN QUERY
    SELECT to_jsonb(c.*), to_jsonb(t.*)
      FROM public.ai_dispatch_load_candidates c
      JOIN public.ai_dispatch_search_tasks t ON t.id = c.search_task_id
     WHERE c.id = _candidate_id AND t.dispatcher_id = v_disp;
END; $$;

GRANT EXECUTE ON FUNCTION public.agent_get_candidate_scoring_context(text, uuid)
  TO anon, authenticated;