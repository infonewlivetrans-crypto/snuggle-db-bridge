ALTER TABLE public.managers
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS managers_user_id_key ON public.managers(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS managers_user_id_idx ON public.managers(user_id);