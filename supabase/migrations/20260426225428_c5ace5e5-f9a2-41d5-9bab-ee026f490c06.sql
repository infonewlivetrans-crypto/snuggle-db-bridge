-- Extend order_status enum
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'delivered';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'not_delivered';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'defective';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'awaiting_resend';

-- Extend point_status enum with delivery reasons
ALTER TYPE public.point_status ADD VALUE IF NOT EXISTS 'returned_to_warehouse';
ALTER TYPE public.point_status ADD VALUE IF NOT EXISTS 'defective';
ALTER TYPE public.point_status ADD VALUE IF NOT EXISTS 'no_payment';
ALTER TYPE public.point_status ADD VALUE IF NOT EXISTS 'no_qr';
ALTER TYPE public.point_status ADD VALUE IF NOT EXISTS 'client_no_answer';
ALTER TYPE public.point_status ADD VALUE IF NOT EXISTS 'client_absent';
ALTER TYPE public.point_status ADD VALUE IF NOT EXISTS 'client_refused';
ALTER TYPE public.point_status ADD VALUE IF NOT EXISTS 'no_unloading';
ALTER TYPE public.point_status ADD VALUE IF NOT EXISTS 'problem';

-- Delivery reports table
CREATE TABLE IF NOT EXISTS public.delivery_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL,
  route_point_id UUID,
  route_id UUID,
  outcome TEXT NOT NULL, -- 'delivered' | 'not_delivered' | 'defective'
  reason TEXT, -- raw point_status value as text for flexibility
  driver_name TEXT,
  comment TEXT,
  cash_received BOOLEAN NOT NULL DEFAULT false,
  qr_received BOOLEAN NOT NULL DEFAULT false,
  requires_resend BOOLEAN NOT NULL DEFAULT false,
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_reports_order ON public.delivery_reports(order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_reports_route ON public.delivery_reports(route_id);

ALTER TABLE public.delivery_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view delivery_reports" ON public.delivery_reports FOR SELECT USING (true);
CREATE POLICY "Anyone can insert delivery_reports" ON public.delivery_reports FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update delivery_reports" ON public.delivery_reports FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete delivery_reports" ON public.delivery_reports FOR DELETE USING (true);