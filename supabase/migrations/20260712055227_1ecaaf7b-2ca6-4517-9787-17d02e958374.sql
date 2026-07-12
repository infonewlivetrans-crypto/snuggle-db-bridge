ALTER TABLE public.ai_dispatch_search_tasks
  ADD COLUMN IF NOT EXISTS filter_fingerprint text,
  ADD COLUMN IF NOT EXISTS initial_scan_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS initial_scan_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS initial_scan_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS initial_scan_pages_read integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS initial_scan_error text,
  ADD COLUMN IF NOT EXISTS last_seen_page_fingerprint text,
  ADD COLUMN IF NOT EXISTS pagination_max_pages integer NOT NULL DEFAULT 500;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_dispatch_search_tasks_initial_scan_status_chk'
  ) THEN
    ALTER TABLE public.ai_dispatch_search_tasks
      ADD CONSTRAINT ai_dispatch_search_tasks_initial_scan_status_chk
      CHECK (initial_scan_status IN ('pending','running','done','reset','failed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ai_dispatch_search_tasks_filter_fp_idx
  ON public.ai_dispatch_search_tasks (dispatcher_id, filter_fingerprint);

ALTER TABLE public.ai_dispatch_load_candidates
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS rejection_details jsonb,
  ADD COLUMN IF NOT EXISTS first_seen_page integer,
  ADD COLUMN IF NOT EXISTS last_seen_page integer,
  ADD COLUMN IF NOT EXISTS rating_negative boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rating_reasons jsonb;

CREATE INDEX IF NOT EXISTS ai_dispatch_load_candidates_rejection_idx
  ON public.ai_dispatch_load_candidates (search_task_id, rejection_reason)
  WHERE rejection_reason IS NOT NULL;

CREATE OR REPLACE FUNCTION public.agent_reset_initial_scan_if_filters_changed(
  _task_id uuid,
  _fingerprint text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prev text;
  did_reset boolean := false;
BEGIN
  SELECT filter_fingerprint INTO prev
  FROM public.ai_dispatch_search_tasks
  WHERE id = _task_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  IF prev IS DISTINCT FROM _fingerprint THEN
    UPDATE public.ai_dispatch_search_tasks
      SET filter_fingerprint = _fingerprint,
          initial_scan_status = 'reset',
          initial_scan_pages_read = 0,
          initial_scan_started_at = NULL,
          initial_scan_completed_at = NULL,
          initial_scan_error = NULL,
          last_seen_page_fingerprint = NULL,
          updated_at = now()
      WHERE id = _task_id;
    did_reset := true;
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'reset', did_reset,
    'previous_fingerprint', prev,
    'new_fingerprint', _fingerprint
  );
END;
$$;

REVOKE ALL ON FUNCTION public.agent_reset_initial_scan_if_filters_changed(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.agent_reset_initial_scan_if_filters_changed(uuid, text) TO anon, authenticated, service_role;
