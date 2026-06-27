
CREATE TABLE public.dispatcher_forwarder_ext (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  inn text,
  ogrn text,
  legal_form text,
  phone text,
  email text,
  contact_person text,
  city text,
  website text,
  okved_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  has_okved_5229 boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'new',
  dispatcher_comment text,
  archived_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispatcher_forwarder_ext TO authenticated;
GRANT ALL ON public.dispatcher_forwarder_ext TO service_role;

ALTER TABLE public.dispatcher_forwarder_ext ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dispatcher_forwarder_ext_select"
  ON public.dispatcher_forwarder_ext FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'dispatcher'));

CREATE POLICY "dispatcher_forwarder_ext_insert"
  ON public.dispatcher_forwarder_ext FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'dispatcher'));

CREATE POLICY "dispatcher_forwarder_ext_update"
  ON public.dispatcher_forwarder_ext FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'dispatcher'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'dispatcher'));

CREATE POLICY "dispatcher_forwarder_ext_delete"
  ON public.dispatcher_forwarder_ext FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'dispatcher'));

CREATE INDEX dispatcher_forwarder_ext_inn_idx ON public.dispatcher_forwarder_ext (inn);
CREATE INDEX dispatcher_forwarder_ext_company_idx ON public.dispatcher_forwarder_ext (company_name);
CREATE INDEX dispatcher_forwarder_ext_status_idx ON public.dispatcher_forwarder_ext (status);
CREATE INDEX dispatcher_forwarder_ext_okved_idx ON public.dispatcher_forwarder_ext (has_okved_5229);

CREATE TRIGGER update_dispatcher_forwarder_ext_updated_at
  BEFORE UPDATE ON public.dispatcher_forwarder_ext
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
