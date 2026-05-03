INSERT INTO public.system_settings (setting_key, setting_value, description, category, is_public)
VALUES
  ('demo_mode_enabled', 'false'::jsonb, 'Включает демо-режим: бейдж и подсказки в интерфейсе', 'general', true),
  ('driver_document_photos_enabled', 'false'::jsonb, 'Если включено — водитель обязан загружать фото документов (подписанные документы, оплата, место выгрузки). QR-код всегда обязателен.', 'driver', true)
ON CONFLICT (setting_key) DO NOTHING;