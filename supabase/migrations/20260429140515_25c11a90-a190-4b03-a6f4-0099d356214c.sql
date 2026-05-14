-- Журнал фактической загрузки товара по отгрузке (dock event)
CREATE TABLE IF NOT EXISTS public.dock_loaded_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_route_id uuid NOT NULL,
  warehouse_id uuid,
  product_id uuid,
  nomenclature text NOT NULL,
  unit text,
  qty_loaded numeric NOT NULL DEFAULT 0,
  comment text,
  loaded_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dock_loaded_items_route ON public.dock_loaded_items(delivery_route_id);
CREATE INDEX IF NOT EXISTS idx_dock_loaded_items_product ON public.dock_loaded_items(product_id);

ALTER TABLE public.dock_loaded_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view dock_loaded_items" ON public.dock_loaded_items FOR SELECT USING (true);
CREATE POLICY "Anyone can insert dock_loaded_items" ON public.dock_loaded_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update dock_loaded_items" ON public.dock_loaded_items FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete dock_loaded_items" ON public.dock_loaded_items FOR DELETE USING (true);
