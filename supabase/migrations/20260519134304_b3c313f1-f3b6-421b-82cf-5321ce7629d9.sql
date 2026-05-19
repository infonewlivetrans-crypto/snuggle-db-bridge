ALTER TABLE public.route_point_photos
  ADD COLUMN IF NOT EXISTS bucket text NOT NULL DEFAULT 'route-point-photos',
  ADD COLUMN IF NOT EXISTS path text,
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS mime_type text;

UPDATE public.route_point_photos
SET path = storage_path
WHERE path IS NULL AND storage_path IS NOT NULL;

ALTER TABLE public.route_point_photo_uploads
  ADD COLUMN IF NOT EXISTS bucket text NOT NULL DEFAULT 'route-point-photos',
  ADD COLUMN IF NOT EXISTS path text,
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS mime_type text;

UPDATE public.route_point_photo_uploads
SET path = storage_path
WHERE path IS NULL AND storage_path IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_route_point_photos_bucket_path
  ON public.route_point_photos(bucket, path);

CREATE INDEX IF NOT EXISTS idx_route_point_photo_uploads_bucket_path
  ON public.route_point_photo_uploads(bucket, path);