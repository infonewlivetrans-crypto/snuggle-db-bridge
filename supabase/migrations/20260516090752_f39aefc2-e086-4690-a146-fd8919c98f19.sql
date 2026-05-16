ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS manager_comment text,
  ADD COLUMN IF NOT EXISTS recipient_contact_time text,
  ADD COLUMN IF NOT EXISTS recipient_work_hours text,
  ADD COLUMN IF NOT EXISTS recipient_delivery_comment text,
  ADD COLUMN IF NOT EXISTS recipient_access_comment text,
  ADD COLUMN IF NOT EXISTS recipient_extra_note text;