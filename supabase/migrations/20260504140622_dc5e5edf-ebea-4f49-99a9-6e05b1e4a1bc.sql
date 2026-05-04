-- Инвайт-токены: вход без email для водителей и менеджеров.
-- Логика: админ создаёт пользователя с ФИО+телефон+роль(driver|manager),
-- система создаёт скрытого Supabase-пользователя c псевдо-email <token>@invite.radius-track.local,
-- запись в invite_tokens хранит сам токен и ссылку на этого user-а.
-- Серверная функция /api/invite-login обменивает токен на полноценную сессию.

CREATE TABLE IF NOT EXISTS public.invite_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT,
  role app_role NOT NULL,
  comment TEXT,
  -- привязка к справочникам, чтобы кабинет видел только свои данные
  driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  manager_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  CONSTRAINT invite_tokens_role_check CHECK (role IN ('driver','manager'))
);

CREATE INDEX IF NOT EXISTS invite_tokens_token_idx ON public.invite_tokens(token);
CREATE INDEX IF NOT EXISTS invite_tokens_user_id_idx ON public.invite_tokens(user_id);
CREATE INDEX IF NOT EXISTS invite_tokens_role_idx ON public.invite_tokens(role);

CREATE TRIGGER trg_invite_tokens_updated_at
BEFORE UPDATE ON public.invite_tokens
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.invite_tokens ENABLE ROW LEVEL SECURITY;

-- Только админы могут видеть/менять список токенов через клиент.
-- Сервер ходит через service role и обходит RLS.
CREATE POLICY "Admins can read invite tokens"
ON public.invite_tokens FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert invite tokens"
ON public.invite_tokens FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update invite tokens"
ON public.invite_tokens FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete invite tokens"
ON public.invite_tokens FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));