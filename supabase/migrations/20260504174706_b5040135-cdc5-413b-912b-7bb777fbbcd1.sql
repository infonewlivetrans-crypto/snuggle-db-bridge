ALTER TABLE public.invite_tokens DROP CONSTRAINT IF EXISTS invite_tokens_role_check;
ALTER TABLE public.invite_tokens ADD CONSTRAINT invite_tokens_role_check
  CHECK (role = ANY (ARRAY['admin'::app_role, 'logist'::app_role, 'manager'::app_role, 'driver'::app_role]));