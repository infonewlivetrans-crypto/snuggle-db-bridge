
CREATE TABLE public.dispatcher_carrier_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatcher_carrier_ext_id uuid NOT NULL REFERENCES public.dispatcher_carrier_ext(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX dispatcher_carrier_users_user_active_uniq
  ON public.dispatcher_carrier_users(user_id) WHERE status = 'active';

CREATE INDEX dispatcher_carrier_users_ext_idx
  ON public.dispatcher_carrier_users(dispatcher_carrier_ext_id);

GRANT SELECT ON public.dispatcher_carrier_users TO authenticated;
GRANT ALL ON public.dispatcher_carrier_users TO service_role;

ALTER TABLE public.dispatcher_carrier_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dispatcher_carrier_users select own or staff"
  ON public.dispatcher_carrier_users
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'dispatcher')
  );

CREATE POLICY "dispatcher_carrier_users staff manage"
  ON public.dispatcher_carrier_users
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'dispatcher')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'dispatcher')
  );

CREATE OR REPLACE FUNCTION public.dispatcher_carrier_users_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER dispatcher_carrier_users_updated_at
  BEFORE UPDATE ON public.dispatcher_carrier_users
  FOR EACH ROW EXECUTE FUNCTION public.dispatcher_carrier_users_set_updated_at();
