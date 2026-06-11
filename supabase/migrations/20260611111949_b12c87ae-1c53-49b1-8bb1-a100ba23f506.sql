ALTER TABLE public.dispatcher_freights
  ADD COLUMN IF NOT EXISTS customer_emails text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS customer_send_comment text;