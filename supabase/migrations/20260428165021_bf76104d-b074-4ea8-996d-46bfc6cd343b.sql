ALTER TYPE body_type ADD VALUE IF NOT EXISTS 'gazelle';
ALTER TYPE body_type ADD VALUE IF NOT EXISTS 'sideboard';
ALTER TYPE body_type ADD VALUE IF NOT EXISTS 'long_vehicle';

ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS required_body_length_m numeric,
  ADD COLUMN IF NOT EXISTS requires_tent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_manipulator boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_straps boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS transport_comment text;