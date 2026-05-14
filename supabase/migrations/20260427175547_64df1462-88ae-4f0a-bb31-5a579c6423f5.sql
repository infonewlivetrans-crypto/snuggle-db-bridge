-- =========================================================
-- Carrier/driver self-registration via invite link + 1C sync
-- =========================================================

-- 1) Invite tokens for self-registration
CREATE TABLE public.carrier_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  invite_type TEXT NOT NULL DEFAULT 'carrier', -- 'carrier' | 'driver'
  carrier_id UUID, -- if invite is for an existing carrier (to add a driver)
  email TEXT,
  phone TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'used' | 'revoked'
  used_at TIMESTAMPTZ,
  used_carrier_id UUID,
  used_driver_id UUID,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.carrier_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view carrier_invites"  ON public.carrier_invites FOR SELECT USING (true);
CREATE POLICY "Anyone can insert carrier_invites" ON public.carrier_invites FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update carrier_invites" ON public.carrier_invites FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete carrier_invites" ON public.carrier_invites FOR DELETE USING (true);

CREATE TRIGGER trg_carrier_invites_updated
BEFORE UPDATE ON public.carrier_invites
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Carrier documents (passport scans, OGRN, license copies, etc.)
CREATE TABLE public.carrier_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_id UUID,
  driver_id UUID,
  vehicle_id UUID,
  doc_type TEXT NOT NULL, -- 'passport' | 'ogrn' | 'license' | 'sts' | 'pts' | 'self_employed_cert' | 'other'
  title TEXT,
  file_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.carrier_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view carrier_documents"  ON public.carrier_documents FOR SELECT USING (true);
CREATE POLICY "Anyone can insert carrier_documents" ON public.carrier_documents FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update carrier_documents" ON public.carrier_documents FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete carrier_documents" ON public.carrier_documents FOR DELETE USING (true);

CREATE INDEX idx_carrier_documents_carrier ON public.carrier_documents(carrier_id);
CREATE INDEX idx_carrier_documents_driver  ON public.carrier_documents(driver_id);
CREATE INDEX idx_carrier_documents_vehicle ON public.carrier_documents(vehicle_id);

-- 3) Portal access tokens (passwordless personal cabinet)
ALTER TABLE public.carriers ADD COLUMN portal_token TEXT UNIQUE;
ALTER TABLE public.drivers  ADD COLUMN portal_token TEXT UNIQUE;

-- 4) 1C external refs (maps our IDs <-> 1C IDs across entities)
CREATE TABLE public.external_refs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity TEXT NOT NULL,        -- 'order' | 'client' | 'product' | 'warehouse' | 'carrier' | 'driver' | 'vehicle' | 'manager' | 'payment'
  local_id UUID,               -- our row id (nullable, for outbound-only mappings)
  external_id TEXT NOT NULL,   -- id in 1C
  external_system TEXT NOT NULL DEFAULT '1c',
  payload JSONB,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity, external_system, external_id)
);

ALTER TABLE public.external_refs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view external_refs"  ON public.external_refs FOR SELECT USING (true);
CREATE POLICY "Anyone can insert external_refs" ON public.external_refs FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update external_refs" ON public.external_refs FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete external_refs" ON public.external_refs FOR DELETE USING (true);

CREATE INDEX idx_external_refs_local ON public.external_refs(entity, local_id);

-- 5) Add external_id / source columns where useful
ALTER TABLE public.orders     ADD COLUMN external_id TEXT, ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE public.warehouses ADD COLUMN external_id TEXT, ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE public.carriers   ADD COLUMN external_id TEXT, ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE public.drivers    ADD COLUMN external_id TEXT, ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';

-- 6) Lightweight clients & products tables for 1C ingest
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  name TEXT NOT NULL,
  inn TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  manager_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view clients"  ON public.clients FOR SELECT USING (true);
CREATE POLICY "Anyone can insert clients" ON public.clients FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update clients" ON public.clients FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete clients" ON public.clients FOR DELETE USING (true);
CREATE TRIGGER trg_clients_updated BEFORE UPDATE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  sku TEXT,
  name TEXT NOT NULL,
  unit TEXT,
  weight_kg NUMERIC,
  volume_m3 NUMERIC,
  stock_qty NUMERIC,
  warehouse_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view products"  ON public.products FOR SELECT USING (true);
CREATE POLICY "Anyone can insert products" ON public.products FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update products" ON public.products FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete products" ON public.products FOR DELETE USING (true);
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7) Outbound queue: events to push to 1C (statuses, payments, photos, reports)
CREATE TABLE public.onec_outbound (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,    -- 'order_status' | 'delivery_report' | 'payment' | 'photo' | 'driver_report'
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'sent' | 'failed'
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.onec_outbound ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view onec_outbound"  ON public.onec_outbound FOR SELECT USING (true);
CREATE POLICY "Anyone can insert onec_outbound" ON public.onec_outbound FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update onec_outbound" ON public.onec_outbound FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete onec_outbound" ON public.onec_outbound FOR DELETE USING (true);

-- 8) Trigger: enqueue order status change to 1C outbound
CREATE OR REPLACE FUNCTION public.enqueue_order_status_to_1c()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.onec_outbound (event_type, payload)
    VALUES (
      'order_status',
      jsonb_build_object(
        'order_id', NEW.id,
        'external_id', NEW.external_id,
        'order_number', NEW.order_number,
        'status', NEW.status,
        'cash_received', NEW.cash_received,
        'qr_received', NEW.qr_received,
        'updated_at', NEW.updated_at
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_orders_outbound_1c
AFTER UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.enqueue_order_status_to_1c();

-- 9) Trigger: enqueue delivery report to 1C
CREATE OR REPLACE FUNCTION public.enqueue_delivery_report_to_1c()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.onec_outbound (event_type, payload)
  VALUES (
    'delivery_report',
    jsonb_build_object(
      'report_id', NEW.id,
      'order_id', NEW.order_id,
      'route_id', NEW.route_id,
      'outcome', NEW.outcome,
      'reason', NEW.reason,
      'driver_name', NEW.driver_name,
      'cash_received', NEW.cash_received,
      'qr_received', NEW.qr_received,
      'requires_resend', NEW.requires_resend,
      'comment', NEW.comment,
      'delivered_at', NEW.delivered_at
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_delivery_reports_outbound_1c
AFTER INSERT ON public.delivery_reports
FOR EACH ROW EXECUTE FUNCTION public.enqueue_delivery_report_to_1c();