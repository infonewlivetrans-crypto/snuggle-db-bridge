
CREATE TABLE public.stock_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_number text NOT NULL,
  source_warehouse_id uuid NOT NULL,
  destination_warehouse_id uuid NOT NULL,
  product_id uuid NOT NULL,
  qty numeric NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  sent_at timestamp with time zone,
  arrived_at timestamp with time zone,
  accepted_at timestamp with time zone,
  cancelled_at timestamp with time zone,
  comment text,
  created_by text,
  in_transit_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT stock_transfers_status_check CHECK (status = ANY (ARRAY['draft','awaiting_send','in_transit','arrived','accepted','cancelled']))
);

ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view stock_transfers" ON public.stock_transfers FOR SELECT USING (true);
CREATE POLICY "Anyone can insert stock_transfers" ON public.stock_transfers FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update stock_transfers" ON public.stock_transfers FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete stock_transfers" ON public.stock_transfers FOR DELETE USING (true);

CREATE TRIGGER update_stock_transfers_updated_at
BEFORE UPDATE ON public.stock_transfers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_stock_transfers_status ON public.stock_transfers(status);
CREATE INDEX idx_stock_transfers_source ON public.stock_transfers(source_warehouse_id);
CREATE INDEX idx_stock_transfers_dest ON public.stock_transfers(destination_warehouse_id);
CREATE INDEX idx_stock_transfers_product ON public.stock_transfers(product_id);
