ALTER TABLE public.product_stock_settings
ADD COLUMN IF NOT EXISTS priority smallint NOT NULL DEFAULT 3;

COMMENT ON COLUMN public.product_stock_settings.priority IS 'Приоритет товара: 1 — высокий, 2 — средний, 3 — обычный, 4 — низкий';