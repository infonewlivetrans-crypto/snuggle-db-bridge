CREATE TYPE public.transport_request_priority AS ENUM ('low','medium','high','urgent');

ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS departure_time time without time zone,
  ADD COLUMN IF NOT EXISTS request_priority public.transport_request_priority NOT NULL DEFAULT 'medium';