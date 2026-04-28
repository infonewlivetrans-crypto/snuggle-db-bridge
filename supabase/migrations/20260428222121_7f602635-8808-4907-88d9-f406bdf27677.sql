-- Add return-related order statuses
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'awaiting_return';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'return_accepted';