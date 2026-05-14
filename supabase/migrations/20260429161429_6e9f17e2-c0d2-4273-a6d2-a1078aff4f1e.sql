DO $$
BEGIN
  ALTER TYPE public.supply_request_source_type ADD VALUE IF NOT EXISTS 'supplier';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;