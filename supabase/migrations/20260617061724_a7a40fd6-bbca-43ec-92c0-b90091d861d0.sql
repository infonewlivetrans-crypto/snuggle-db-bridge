ALTER TABLE public.dispatcher_freights
  ADD COLUMN IF NOT EXISTS source_text text,
  ADD COLUMN IF NOT EXISTS parsed_payload jsonb,
  ADD COLUMN IF NOT EXISTS cargo_items jsonb,
  ADD COLUMN IF NOT EXISTS route_points jsonb,
  ADD COLUMN IF NOT EXISTS offer_status text DEFAULT 'draft';