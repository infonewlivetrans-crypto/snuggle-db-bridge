
CREATE TABLE IF NOT EXISTS public.dispatcher_partner_card_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatcher_carrier_ext_id uuid NOT NULL REFERENCES public.dispatcher_carrier_ext(id) ON DELETE CASCADE,
  dispatcher_driver_ext_id uuid NULL REFERENCES public.dispatcher_driver_ext(id) ON DELETE SET NULL,
  dispatcher_vehicle_ext_id uuid NULL REFERENCES public.dispatcher_vehicle_ext(id) ON DELETE SET NULL,
  dispatcher_deal_id uuid NULL REFERENCES public.dispatcher_deals(id) ON DELETE SET NULL,
  recipient_name text NULL,
  recipient_email text NULL,
  recipient_phone text NULL,
  recipient_messenger text NULL,
  send_channel text NOT NULL DEFAULT 'manual',
  subject text NULL,
  message_text text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  sent_by uuid NULL,
  sent_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dispatcher_partner_card_sends_channel_chk CHECK (
    send_channel IN ('manual','email','whatsapp','telegram','max','phone','other')
  ),
  CONSTRAINT dispatcher_partner_card_sends_status_chk CHECK (
    status IN ('draft','copied','sent','cancelled','archive')
  )
);

CREATE INDEX IF NOT EXISTS idx_dpcs_carrier ON public.dispatcher_partner_card_sends(dispatcher_carrier_ext_id);
CREATE INDEX IF NOT EXISTS idx_dpcs_deal ON public.dispatcher_partner_card_sends(dispatcher_deal_id);
CREATE INDEX IF NOT EXISTS idx_dpcs_created_at ON public.dispatcher_partner_card_sends(created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispatcher_partner_card_sends TO authenticated;
GRANT ALL ON public.dispatcher_partner_card_sends TO service_role;

ALTER TABLE public.dispatcher_partner_card_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dpcs admin/dispatcher read"
  ON public.dispatcher_partner_card_sends
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher'));

CREATE POLICY "dpcs admin/dispatcher write"
  ON public.dispatcher_partner_card_sends
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher'));

CREATE TRIGGER trg_dpcs_updated_at
  BEFORE UPDATE ON public.dispatcher_partner_card_sends
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
