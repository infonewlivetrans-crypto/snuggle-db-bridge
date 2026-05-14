-- Add logist resolution fields to order_problem_reports
ALTER TABLE public.order_problem_reports
  ADD COLUMN IF NOT EXISTS resolution_status TEXT NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS logist_comment TEXT,
  ADD COLUMN IF NOT EXISTS resolved_by TEXT,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

-- Constrain status values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_problem_reports_resolution_status_chk'
  ) THEN
    ALTER TABLE public.order_problem_reports
      ADD CONSTRAINT order_problem_reports_resolution_status_chk
      CHECK (resolution_status IN ('new','in_progress','resolved'));
  END IF;
END $$;