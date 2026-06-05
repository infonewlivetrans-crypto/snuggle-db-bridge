
-- Добавляем 'dispatcher' в enum app_role (если ещё нет).
-- ALTER TYPE ... ADD VALUE нельзя использовать внутри той же транзакции,
-- где значение задействуется, поэтому это отдельная миграция.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'app_role' AND e.enumlabel = 'dispatcher'
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'dispatcher';
  END IF;
END $$;
