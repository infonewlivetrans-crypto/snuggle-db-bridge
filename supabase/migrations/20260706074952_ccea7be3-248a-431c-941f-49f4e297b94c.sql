
ALTER TABLE public.ai_dispatch_search_tasks
  ADD COLUMN IF NOT EXISTS orchestration_status text,
  ADD COLUMN IF NOT EXISTS orchestration_run_id uuid,
  ADD COLUMN IF NOT EXISTS orchestration_current_command_id uuid,
  ADD COLUMN IF NOT EXISTS orchestration_error_code text,
  ADD COLUMN IF NOT EXISTS orchestration_error text,
  ADD COLUMN IF NOT EXISTS orchestration_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS orchestration_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS orchestration_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS orchestration_retry_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_ai_dispatch_search_tasks_orchestration_run
  ON public.ai_dispatch_search_tasks(orchestration_run_id)
  WHERE orchestration_run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_dispatch_search_tasks_dispatcher_orch_status
  ON public.ai_dispatch_search_tasks(dispatcher_id, orchestration_status)
  WHERE orchestration_status IS NOT NULL;
