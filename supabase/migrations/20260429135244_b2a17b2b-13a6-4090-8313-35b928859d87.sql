
-- 1) Order items table (Состав заказа, как в 1С)
CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  product_id uuid,
  nomenclature text NOT NULL,
  characteristic text,
  quality text,
  qty numeric NOT NULL DEFAULT 0,
  unit text,
  weight_kg numeric,
  volume_m3 numeric,
  order_amount numeric,
  delivery_amount numeric,
  comment text,
  external_id text,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT order_items_source_check CHECK (source = ANY (ARRAY['manual','excel','1c']))
);

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view order_items" ON public.order_items FOR SELECT USING (true);
CREATE POLICY "Anyone can insert order_items" ON public.order_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update order_items" ON public.order_items FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete order_items" ON public.order_items FOR DELETE USING (true);

CREATE TRIGGER update_order_items_updated_at
BEFORE UPDATE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_order_items_order ON public.order_items(order_id);
CREATE INDEX idx_order_items_external ON public.order_items(external_id);

-- 2) 1C-related fields on orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS onec_order_number text,
  ADD COLUMN IF NOT EXISTS onec_transport_request_number text,
  ADD COLUMN IF NOT EXISTS characteristic text,
  ADD COLUMN IF NOT EXISTS quality text;

CREATE INDEX IF NOT EXISTS idx_orders_onec_order_number ON public.orders(onec_order_number);

-- 3) 1C-related fields on routes (заявка на транспорт)
ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS onec_request_number text,
  ADD COLUMN IF NOT EXISTS organization text,
  ADD COLUMN IF NOT EXISTS transport_kind text,
  ADD COLUMN IF NOT EXISTS unloading_zone text,
  ADD COLUMN IF NOT EXISTS mileage_km numeric,
  ADD COLUMN IF NOT EXISTS total_orders_amount numeric,
  ADD COLUMN IF NOT EXISTS carrier_reward numeric,
  ADD COLUMN IF NOT EXISTS delivery_amount numeric;

CREATE INDEX IF NOT EXISTS idx_routes_onec_request_number ON public.routes(onec_request_number);
CREATE INDEX IF NOT EXISTS idx_routes_external_id ON public.routes(external_id);
