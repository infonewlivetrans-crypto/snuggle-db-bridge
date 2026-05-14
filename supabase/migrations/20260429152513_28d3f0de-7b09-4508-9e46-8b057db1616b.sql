CREATE TABLE public.transport_request_warehouse_status_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transport_request_id UUID NOT NULL,
  status TEXT NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX trwsl_request_idx
  ON public.transport_request_warehouse_status_log (transport_request_id, created_at DESC);

CREATE UNIQUE INDEX trwsl_request_status_uniq
  ON public.transport_request_warehouse_status_log (transport_request_id, status);

ALTER TABLE public.transport_request_warehouse_status_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view warehouse status log"
  ON public.transport_request_warehouse_status_log FOR SELECT USING (true);
CREATE POLICY "Anyone can insert warehouse status log"
  ON public.transport_request_warehouse_status_log FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update warehouse status log"
  ON public.transport_request_warehouse_status_log FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete warehouse status log"
  ON public.transport_request_warehouse_status_log FOR DELETE USING (true);
