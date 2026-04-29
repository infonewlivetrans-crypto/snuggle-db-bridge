ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category TEXT;
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category);