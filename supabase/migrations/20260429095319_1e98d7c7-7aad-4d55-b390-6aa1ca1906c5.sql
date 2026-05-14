-- Поля для обработки возвратов на склад
ALTER TABLE public.route_points
  ADD COLUMN IF NOT EXISTS wh_return_status TEXT NOT NULL DEFAULT 'expected',
  ADD COLUMN IF NOT EXISTS wh_return_arrived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS wh_return_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS wh_return_accepted_by TEXT,
  ADD COLUMN IF NOT EXISTS wh_return_comment TEXT,
  ADD COLUMN IF NOT EXISTS wh_return_status_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS wh_return_status_changed_by TEXT;

-- Допустимые значения статуса возврата
ALTER TABLE public.route_points DROP CONSTRAINT IF EXISTS route_points_wh_return_status_check;
ALTER TABLE public.route_points
  ADD CONSTRAINT route_points_wh_return_status_check
  CHECK (wh_return_status IN ('expected','arrived','accepted','needs_check','defective','ready_to_resend'));

CREATE INDEX IF NOT EXISTS idx_route_points_wh_return
  ON public.route_points(dp_return_warehouse_id, wh_return_status)
  WHERE dp_status = 'returned_to_warehouse';