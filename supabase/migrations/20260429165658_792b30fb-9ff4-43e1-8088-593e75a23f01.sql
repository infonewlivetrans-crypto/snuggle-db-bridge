-- Журнал импорта Excel
CREATE TABLE public.import_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity TEXT NOT NULL,
  file_name TEXT,
  source TEXT NOT NULL DEFAULT 'excel',
  imported_by TEXT,
  total_rows INTEGER NOT NULL DEFAULT 0,
  inserted_rows INTEGER NOT NULL DEFAULT 0,
  failed_rows INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'loaded',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.import_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view import_logs" ON public.import_logs FOR SELECT USING (true);
CREATE POLICY "Anyone can insert import_logs" ON public.import_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update import_logs" ON public.import_logs FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete import_logs" ON public.import_logs FOR DELETE USING (true);

-- Детали по строкам импорта
CREATE TABLE public.import_log_rows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  import_log_id UUID NOT NULL REFERENCES public.import_logs(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'inserted',
  error_message TEXT,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.import_log_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view import_log_rows" ON public.import_log_rows FOR SELECT USING (true);
CREATE POLICY "Anyone can insert import_log_rows" ON public.import_log_rows FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update import_log_rows" ON public.import_log_rows FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete import_log_rows" ON public.import_log_rows FOR DELETE USING (true);

CREATE INDEX idx_import_log_rows_log_id ON public.import_log_rows(import_log_id);
CREATE INDEX idx_import_logs_created_at ON public.import_logs(created_at DESC);