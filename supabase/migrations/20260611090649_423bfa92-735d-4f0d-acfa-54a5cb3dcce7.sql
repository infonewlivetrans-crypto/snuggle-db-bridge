
ALTER TABLE public.dispatcher_vehicle_ext
  ADD COLUMN IF NOT EXISTS current_city text,
  ADD COLUMN IF NOT EXISTS ready_comment text,
  ADD COLUMN IF NOT EXISTS dispatcher_taken_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dispatcher_taken_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispatcher_work_status text DEFAULT 'free';

CREATE INDEX IF NOT EXISTS idx_dispatcher_vehicle_ext_taken_by
  ON public.dispatcher_vehicle_ext(dispatcher_taken_by)
  WHERE dispatcher_taken_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dispatcher_vehicle_ext_work_status
  ON public.dispatcher_vehicle_ext(dispatcher_work_status);
