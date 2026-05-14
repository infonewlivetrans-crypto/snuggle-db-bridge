
CREATE TABLE public.route_point_photo_uploads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_upload_id TEXT NOT NULL UNIQUE,
  route_point_id UUID NOT NULL,
  order_id UUID,
  kind TEXT NOT NULL,
  storage_path TEXT,
  file_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  actor TEXT,
  device_created_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rppu_route_point ON public.route_point_photo_uploads(route_point_id);
CREATE INDEX idx_rppu_status ON public.route_point_photo_uploads(status);
CREATE INDEX idx_rppu_created ON public.route_point_photo_uploads(created_at DESC);

ALTER TABLE public.route_point_photo_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view photo upload queue"
  ON public.route_point_photo_uploads
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert into photo upload queue"
  ON public.route_point_photo_uploads
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Admins and logists can update photo upload queue"
  ON public.route_point_photo_uploads
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'logist'::app_role)
  );

CREATE POLICY "Admins and logists can delete from photo upload queue"
  ON public.route_point_photo_uploads
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'logist'::app_role)
  );

CREATE TRIGGER update_route_point_photo_uploads_updated_at
  BEFORE UPDATE ON public.route_point_photo_uploads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
