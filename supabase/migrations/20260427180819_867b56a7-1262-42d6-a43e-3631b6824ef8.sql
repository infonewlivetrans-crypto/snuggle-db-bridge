-- ============ system_settings ============
CREATE TABLE public.system_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key TEXT NOT NULL UNIQUE,
  setting_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  is_public BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_system_settings_category ON public.system_settings(category);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view system_settings"
  ON public.system_settings FOR SELECT USING (true);
CREATE POLICY "Anyone can insert system_settings"
  ON public.system_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update system_settings"
  ON public.system_settings FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete system_settings"
  ON public.system_settings FOR DELETE USING (true);

CREATE TRIGGER trg_system_settings_updated_at
  BEFORE UPDATE ON public.system_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ app_versions ============
CREATE TABLE public.app_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  platform TEXT NOT NULL UNIQUE,
  current_version TEXT NOT NULL,
  minimum_required_version TEXT NOT NULL,
  force_update BOOLEAN NOT NULL DEFAULT false,
  update_message TEXT,
  app_store_url TEXT,
  play_market_url TEXT,
  release_notes TEXT,
  released_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view app_versions"
  ON public.app_versions FOR SELECT USING (true);
CREATE POLICY "Anyone can insert app_versions"
  ON public.app_versions FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update app_versions"
  ON public.app_versions FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete app_versions"
  ON public.app_versions FOR DELETE USING (true);

CREATE TRIGGER trg_app_versions_updated_at
  BEFORE UPDATE ON public.app_versions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Seed: базовые настройки ============
INSERT INTO public.system_settings (setting_key, setting_value, description, category) VALUES
  ('driver.instructions',
    '{"text":"1. Проверьте груз перед выездом\n2. Получите QR-код или оплату от клиента\n3. Сделайте фото при доставке\n4. При проблеме сразу свяжитесь с логистом"}'::jsonb,
    'Инструкция для водителя на старте смены','driver'),
  ('driver.checklist',
    '[{"id":"docs","label":"Документы на груз"},{"id":"fuel","label":"Топливо"},{"id":"phone","label":"Телефон заряжен"},{"id":"qr","label":"QR-сканер работает"}]'::jsonb,
    'Чек-лист водителя перед выездом','driver'),
  ('rules.no_payment_no_unload',
    '{"enabled":true,"message":"Без оплаты не выгружать груз"}'::jsonb,
    'Правило: без оплаты не выгружать','rules'),
  ('rules.qr',
    '{"required_for_payment_types":["qr","mixed"],"message":"Получите QR-код от клиента перед выгрузкой"}'::jsonb,
    'Правила работы с QR-кодами','rules'),
  ('limits.vehicle',
    '{"max_weight_kg":20000,"max_volume_m3":82,"warn_threshold_pct":90}'::jsonb,
    'Лимиты транспорта по умолчанию','limits'),
  ('notifications.templates',
    '{"order_delivered":"Заказ {{order_number}} доставлен","order_failed":"Заказ {{order_number}} не доставлен: {{reason}}","resend_required":"Заказ {{order_number}} требует повторной доставки"}'::jsonb,
    'Шаблоны уведомлений менеджеру','notifications'),
  ('warehouse.schedule',
    '{"mon_fri":{"open":"08:00","close":"20:00"},"sat":{"open":"09:00","close":"15:00"},"sun":null}'::jsonb,
    'График работы складов по умолчанию','warehouse'),
  ('roles.list',
    '[{"key":"admin","label":"Администратор"},{"key":"logist","label":"Логист"},{"key":"manager","label":"Менеджер"},{"key":"driver","label":"Водитель"},{"key":"carrier","label":"Перевозчик"}]'::jsonb,
    'Роли пользователей системы','roles'),
  ('order.problem_types',
    '[{"key":"no_payment","label":"Нет оплаты"},{"key":"no_qr","label":"Нет QR"},{"key":"client_no_answer","label":"Клиент не отвечает"},{"key":"client_absent","label":"Клиент отсутствует"},{"key":"client_refused","label":"Клиент отказался"},{"key":"defective","label":"Брак"},{"key":"no_unloading","label":"Невозможна выгрузка"},{"key":"problem","label":"Прочее"}]'::jsonb,
    'Типы проблем при доставке','order')
ON CONFLICT (setting_key) DO NOTHING;

-- ============ Seed: версии приложения ============
INSERT INTO public.app_versions (platform, current_version, minimum_required_version, force_update, update_message, app_store_url, play_market_url) VALUES
  ('web','1.0.0','1.0.0',false,'Доступна новая версия. Обновите страницу для продолжения работы.',NULL,NULL),
  ('android','1.0.0','1.0.0',false,'Доступна новая версия приложения. Обновите приложение для продолжения работы.',NULL,'https://play.google.com/store'),
  ('ios','1.0.0','1.0.0',false,'Доступна новая версия приложения. Обновите приложение для продолжения работы.','https://apps.apple.com',NULL)
ON CONFLICT (platform) DO NOTHING;