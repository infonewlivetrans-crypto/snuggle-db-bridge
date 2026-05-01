INSERT INTO public.system_settings (setting_key, setting_value, description, category, is_public)
VALUES (
  'modules.enabled',
  '{"warehouse": true, "supply": true, "accounting": true, "carriers": true, "onec": true, "excel_import": true}'::jsonb,
  'Включение/выключение опциональных модулей системы. Если модуль выключен, его разделы скрываются из меню и не блокируют работу остальных модулей.',
  'modules',
  true
)
ON CONFLICT (setting_key) DO NOTHING;