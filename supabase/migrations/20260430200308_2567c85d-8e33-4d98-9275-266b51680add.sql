
CREATE TABLE IF NOT EXISTS public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL,
  user_name text,
  role text NOT NULL,
  route_id uuid,
  route_label text,
  good text,
  bad text,
  broken text,
  unclear text,
  needed text,
  comment text,
  rating_convenience smallint CHECK (rating_convenience BETWEEN 1 AND 5),
  rating_speed smallint CHECK (rating_speed BETWEEN 1 AND 5),
  rating_stability smallint CHECK (rating_stability BETWEEN 1 AND 5),
  severity text NOT NULL DEFAULT 'normal'
);

CREATE INDEX IF NOT EXISTS feedback_created_idx ON public.feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_user_idx ON public.feedback(user_id);
CREATE INDEX IF NOT EXISTS feedback_role_idx ON public.feedback(role);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY feedback_insert_own ON public.feedback
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY feedback_select_own ON public.feedback
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY feedback_select_admin ON public.feedback
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'director'::app_role));

CREATE POLICY feedback_delete_admin ON public.feedback
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
