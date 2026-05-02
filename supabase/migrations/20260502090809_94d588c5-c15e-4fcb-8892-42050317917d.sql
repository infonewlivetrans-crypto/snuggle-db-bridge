-- Расширяем карточку клиента ключевыми полями + JSON для остальных атрибутов
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS phone_alt text,
  ADD COLUMN IF NOT EXISTS latitude numeric(10,7),
  ADD COLUMN IF NOT EXISTS longitude numeric(10,7),
  ADD COLUMN IF NOT EXISTS working_hours text,
  ADD COLUMN IF NOT EXISTS works_weekends boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS client_type public.client_kind,
  ADD COLUMN IF NOT EXISTS access_notes text,
  ADD COLUMN IF NOT EXISTS unloading_notes text,
  ADD COLUMN IF NOT EXISTS preferred_delivery_time text,
  ADD COLUMN IF NOT EXISTS driver_instructions text,
  ADD COLUMN IF NOT EXISTS extra_attrs jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Быстрый поиск клиента по нормализованному имени/телефону
CREATE INDEX IF NOT EXISTS idx_clients_name_lower ON public.clients ((lower(name)));
CREATE INDEX IF NOT EXISTS idx_clients_phone ON public.clients (phone);
