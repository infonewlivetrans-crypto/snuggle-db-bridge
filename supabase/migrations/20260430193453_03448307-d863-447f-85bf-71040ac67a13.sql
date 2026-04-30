-- Таблица системных ошибок
CREATE TABLE IF NOT EXISTS public.system_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  code TEXT NOT NULL DEFAULT 'unknown',
  title TEXT NOT NULL,
  message TEXT,
  technical TEXT,
  section TEXT,
  action TEXT,
  severity TEXT NOT NULL DEFAULT 'error' CHECK (severity IN ('info','warning','error','critical')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','resolved')),
  user_id UUID,
  user_name TEXT,
  user_role TEXT,
  ip_address TEXT,
  user_agent TEXT,
  url TEXT,
  fingerprint TEXT,
  occurrences INTEGER NOT NULL DEFAULT 1,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  admin_note TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID
);

CREATE INDEX IF NOT EXISTS idx_system_errors_created_at ON public.system_errors (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_errors_status ON public.system_errors (status);
CREATE INDEX IF NOT EXISTS idx_system_errors_severity ON public.system_errors (severity);
CREATE INDEX IF NOT EXISTS idx_system_errors_fingerprint ON public.system_errors (fingerprint);

-- Триггер updated_at
DROP TRIGGER IF EXISTS trg_system_errors_updated ON public.system_errors;
CREATE TRIGGER trg_system_errors_updated
BEFORE UPDATE ON public.system_errors
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.system_errors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sys_err_select_admin_director ON public.system_errors;
CREATE POLICY sys_err_select_admin_director ON public.system_errors
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director'));

DROP POLICY IF EXISTS sys_err_insert_authenticated ON public.system_errors;
CREATE POLICY sys_err_insert_authenticated ON public.system_errors
FOR INSERT TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS sys_err_update_admin ON public.system_errors;
CREATE POLICY sys_err_update_admin ON public.system_errors
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin'))
WITH CHECK (public.has_role(auth.uid(),'admin'));
