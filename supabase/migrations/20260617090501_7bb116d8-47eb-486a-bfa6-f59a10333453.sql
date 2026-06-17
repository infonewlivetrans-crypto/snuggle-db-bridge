
-- ============================================================================
-- dispatcher_carrier_email_accounts
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.dispatcher_carrier_email_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_ext_id uuid NOT NULL REFERENCES public.dispatcher_carrier_ext(id) ON DELETE CASCADE,
  email text NOT NULL,
  from_name text,
  smtp_host text NOT NULL,
  smtp_port integer NOT NULL DEFAULT 465,
  smtp_secure boolean NOT NULL DEFAULT true,
  smtp_user text NOT NULL,
  smtp_password_encrypted text,
  ati_email text,
  is_verified boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  last_test_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dispatcher_carrier_email_accounts_uq UNIQUE (carrier_ext_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispatcher_carrier_email_accounts TO authenticated;
GRANT ALL ON public.dispatcher_carrier_email_accounts TO service_role;

ALTER TABLE public.dispatcher_carrier_email_accounts ENABLE ROW LEVEL SECURITY;

-- Перевозчик-владелец может читать (без пароля — через view)/изменять свою запись.
CREATE POLICY "carrier owner select own email account"
ON public.dispatcher_carrier_email_accounts FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.dispatcher_carrier_users dcu
    WHERE dcu.dispatcher_carrier_ext_id = dispatcher_carrier_email_accounts.carrier_ext_id
      AND dcu.user_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'dispatcher'::app_role)
);

CREATE POLICY "carrier owner insert own email account"
ON public.dispatcher_carrier_email_accounts FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.dispatcher_carrier_users dcu
    WHERE dcu.dispatcher_carrier_ext_id = dispatcher_carrier_email_accounts.carrier_ext_id
      AND dcu.user_id = auth.uid()
  )
);

CREATE POLICY "carrier owner update own email account"
ON public.dispatcher_carrier_email_accounts FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.dispatcher_carrier_users dcu
    WHERE dcu.dispatcher_carrier_ext_id = dispatcher_carrier_email_accounts.carrier_ext_id
      AND dcu.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.dispatcher_carrier_users dcu
    WHERE dcu.dispatcher_carrier_ext_id = dispatcher_carrier_email_accounts.carrier_ext_id
      AND dcu.user_id = auth.uid()
  )
);

CREATE POLICY "carrier owner delete own email account"
ON public.dispatcher_carrier_email_accounts FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.dispatcher_carrier_users dcu
    WHERE dcu.dispatcher_carrier_ext_id = dispatcher_carrier_email_accounts.carrier_ext_id
      AND dcu.user_id = auth.uid()
  )
);

-- Безопасное представление: всё, кроме пароля.
CREATE OR REPLACE VIEW public.dispatcher_carrier_email_accounts_safe
WITH (security_invoker = true) AS
SELECT
  id, carrier_ext_id, email, from_name, smtp_host, smtp_port, smtp_secure,
  smtp_user, ati_email, is_verified, is_active, last_test_at, last_error,
  created_at, updated_at,
  (smtp_password_encrypted IS NOT NULL) AS has_password
FROM public.dispatcher_carrier_email_accounts;

GRANT SELECT ON public.dispatcher_carrier_email_accounts_safe TO authenticated;
GRANT SELECT ON public.dispatcher_carrier_email_accounts_safe TO service_role;

-- ============================================================================
-- dispatcher_email_messages — журнал отправок
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.dispatcher_email_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_ext_id uuid NOT NULL REFERENCES public.dispatcher_carrier_ext(id) ON DELETE CASCADE,
  carrier_request_id uuid REFERENCES public.dispatcher_carrier_requests(id) ON DELETE SET NULL,
  freight_id uuid REFERENCES public.dispatcher_freights(id) ON DELETE SET NULL,
  deal_id uuid REFERENCES public.dispatcher_deals(id) ON DELETE SET NULL,
  from_email text NOT NULL,
  from_name text,
  to_emails text[] NOT NULL DEFAULT '{}',
  cc_emails text[] NOT NULL DEFAULT '{}',
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'sent',
  provider text NOT NULL DEFAULT 'carrier_smtp',
  error_message text,
  sent_at timestamptz,
  client_request_id text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dispatcher_email_messages_status_chk
    CHECK (status IN ('draft','sent','failed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS dispatcher_email_messages_client_req_uq
ON public.dispatcher_email_messages(created_by, client_request_id)
WHERE client_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS dispatcher_email_messages_carrier_idx
ON public.dispatcher_email_messages(carrier_ext_id, created_at DESC);

CREATE INDEX IF NOT EXISTS dispatcher_email_messages_request_idx
ON public.dispatcher_email_messages(carrier_request_id);

GRANT SELECT, INSERT ON public.dispatcher_email_messages TO authenticated;
GRANT ALL ON public.dispatcher_email_messages TO service_role;

ALTER TABLE public.dispatcher_email_messages ENABLE ROW LEVEL SECURITY;

-- Диспетчер/админ — видят все.
CREATE POLICY "dispatcher select all email messages"
ON public.dispatcher_email_messages FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'dispatcher'::app_role)
);

-- Перевозчик — видит свои.
CREATE POLICY "carrier select own email messages"
ON public.dispatcher_email_messages FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.dispatcher_carrier_users dcu
    WHERE dcu.dispatcher_carrier_ext_id = dispatcher_email_messages.carrier_ext_id
      AND dcu.user_id = auth.uid()
  )
);

-- Запись — только dispatcher/admin (отправка идёт от их имени).
CREATE POLICY "dispatcher insert email messages"
ON public.dispatcher_email_messages FOR INSERT TO authenticated
WITH CHECK (
  (public.has_role(auth.uid(), 'admin'::app_role)
   OR public.has_role(auth.uid(), 'dispatcher'::app_role))
  AND created_by = auth.uid()
);

-- updated_at trigger для email_accounts
CREATE OR REPLACE FUNCTION public.dispatcher_email_accounts_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS dispatcher_email_accounts_updated_at
  ON public.dispatcher_carrier_email_accounts;
CREATE TRIGGER dispatcher_email_accounts_updated_at
BEFORE UPDATE ON public.dispatcher_carrier_email_accounts
FOR EACH ROW EXECUTE FUNCTION public.dispatcher_email_accounts_set_updated_at();

-- Realtime publication
DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.dispatcher_carrier_email_accounts';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.dispatcher_email_messages';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.dispatcher_carrier_requests';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
