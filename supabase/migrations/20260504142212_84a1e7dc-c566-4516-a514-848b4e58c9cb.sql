-- 1. Справочник менеджеров
CREATE TABLE IF NOT EXISTS public.managers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  phone TEXT,
  comment TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','needs_review','disabled')),
  source TEXT NOT NULL DEFAULT 'manual',
  external_id TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS managers_normalized_name_key ON public.managers (normalized_name);
CREATE INDEX IF NOT EXISTS managers_active_idx ON public.managers (is_active);
CREATE INDEX IF NOT EXISTS managers_status_idx ON public.managers (status);

ALTER TABLE public.managers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "managers_select_all" ON public.managers
  FOR SELECT USING (true);

CREATE POLICY "managers_insert_role" ON public.managers
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'logist'::app_role));

CREATE POLICY "managers_update_role" ON public.managers
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'logist'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'logist'::app_role));

CREATE POLICY "managers_delete_role" ON public.managers
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_managers_updated_at
  BEFORE UPDATE ON public.managers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Связь invite_tokens → managers
ALTER TABLE public.invite_tokens
  ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES public.managers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS invite_tokens_manager_id_idx ON public.invite_tokens (manager_id);

-- 3. Привязка заказа к менеджеру
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES public.managers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manager_name TEXT;
CREATE INDEX IF NOT EXISTS orders_manager_id_idx ON public.orders (manager_id);