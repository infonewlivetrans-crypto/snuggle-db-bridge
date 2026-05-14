
-- Inbound shipments (приём товара на склад)
CREATE TABLE public.inbound_shipments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shipment_number TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'factory', -- factory | other_warehouse | return
  source_name TEXT,
  source_warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  destination_warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  expected_at TIMESTAMP WITH TIME ZONE,
  arrived_at TIMESTAMP WITH TIME ZONE,
  receiving_started_at TIMESTAMP WITH TIME ZONE,
  accepted_at TIMESTAMP WITH TIME ZONE,
  accepted_by TEXT,
  vehicle_plate TEXT,
  driver_name TEXT,
  driver_phone TEXT,
  status TEXT NOT NULL DEFAULT 'expected', -- expected | arrived | receiving | accepted | problem
  comment TEXT,
  warehouse_comment TEXT,
  problem_reason TEXT,
  problem_comment TEXT,
  problem_photo_url TEXT,
  docs_photo_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.inbound_shipment_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shipment_id UUID NOT NULL REFERENCES public.inbound_shipments(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  sku TEXT,
  unit TEXT,
  qty_expected NUMERIC NOT NULL DEFAULT 0,
  qty_received NUMERIC,
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_inbound_shipments_status ON public.inbound_shipments(status);
CREATE INDEX idx_inbound_shipments_dest_wh ON public.inbound_shipments(destination_warehouse_id);
CREATE INDEX idx_inbound_shipment_items_shipment ON public.inbound_shipment_items(shipment_id);

ALTER TABLE public.inbound_shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbound_shipment_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view inbound_shipments" ON public.inbound_shipments FOR SELECT USING (true);
CREATE POLICY "Anyone can insert inbound_shipments" ON public.inbound_shipments FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update inbound_shipments" ON public.inbound_shipments FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete inbound_shipments" ON public.inbound_shipments FOR DELETE USING (true);

CREATE POLICY "Anyone can view inbound_shipment_items" ON public.inbound_shipment_items FOR SELECT USING (true);
CREATE POLICY "Anyone can insert inbound_shipment_items" ON public.inbound_shipment_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update inbound_shipment_items" ON public.inbound_shipment_items FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete inbound_shipment_items" ON public.inbound_shipment_items FOR DELETE USING (true);

CREATE TRIGGER update_inbound_shipments_updated_at
BEFORE UPDATE ON public.inbound_shipments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-generate shipment_number IN-XXXX
CREATE OR REPLACE FUNCTION public.generate_inbound_shipment_number()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(shipment_number FROM 'IN-(\d+)') AS INTEGER)), 0) + 1
    INTO next_num
  FROM public.inbound_shipments
  WHERE shipment_number ~ '^IN-\d+$';
  RETURN 'IN-' || LPAD(next_num::TEXT, 4, '0');
END $$;

CREATE OR REPLACE FUNCTION public.trg_inbound_shipments_set_number()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.shipment_number IS NULL OR length(trim(NEW.shipment_number)) = 0 THEN
    NEW.shipment_number := public.generate_inbound_shipment_number();
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER inbound_shipments_set_number
BEFORE INSERT ON public.inbound_shipments
FOR EACH ROW EXECUTE FUNCTION public.trg_inbound_shipments_set_number();
