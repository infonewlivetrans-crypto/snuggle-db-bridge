INSERT INTO public.system_settings (setting_key, setting_value, category, description)
VALUES (
  'launch.mode',
  '"full"'::jsonb,
  'general',
  'Режим запуска системы: "minimal" — только базовые разделы (рабочий день, импорт, заказы, маршруты, водитель, отчёты, контроль работы); "full" — все доступные роли разделы.'
)
ON CONFLICT (setting_key) DO NOTHING;