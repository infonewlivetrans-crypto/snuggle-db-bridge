-- Storage bucket for backups (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('backups', 'backups', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: only admins can read/write backup files
CREATE POLICY "Admins can read backups"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'backups' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can upload backups"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'backups' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete backups"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'backups' AND public.has_role(auth.uid(), 'admin'));

-- Backups registry table
CREATE TABLE public.backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running', -- running | success | error
  size_bytes BIGINT,
  storage_path TEXT,
  triggered_by UUID,
  triggered_by_name TEXT,
  trigger_kind TEXT NOT NULL DEFAULT 'manual', -- manual | scheduled
  comment TEXT,
  error_message TEXT,
  tables JSONB
);

ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;

-- Only admin and director can view backups
CREATE POLICY "Admins and directors can view backups"
ON public.backups FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'director'));

-- Only admins can insert/update/delete (server uses service role anyway)
CREATE POLICY "Admins manage backups"
ON public.backups FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_backups_created_at ON public.backups(created_at DESC);