
CREATE TABLE IF NOT EXISTS public.edo_snapshot_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.carrier_edo_documents(id) ON DELETE CASCADE,
  forwarder_id uuid REFERENCES public.dispatcher_forwarder_ext(id) ON DELETE SET NULL,
  checked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  checked_at timestamptz NOT NULL DEFAULT now(),
  audience text NOT NULL DEFAULT 'shared'
    CHECK (audience IN ('shared','dispatcher_internal')),
  decision text NOT NULL
    CHECK (decision IN (
      'no_action_required',
      'recreate_document_recommended',
      'operator_check_required',
      'legal_check_required',
      'ignore_for_training'
    )),
  comment text,
  diff_snapshot_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.edo_snapshot_reviews TO authenticated;
GRANT ALL ON public.edo_snapshot_reviews TO service_role;

CREATE INDEX IF NOT EXISTS idx_edo_snapshot_reviews_doc
  ON public.edo_snapshot_reviews(document_id);
CREATE INDEX IF NOT EXISTS idx_edo_snapshot_reviews_fwd
  ON public.edo_snapshot_reviews(forwarder_id);

ALTER TABLE public.edo_snapshot_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS edo_snapshot_reviews_carrier_sel ON public.edo_snapshot_reviews;
CREATE POLICY edo_snapshot_reviews_carrier_sel
  ON public.edo_snapshot_reviews FOR SELECT
  USING (
    audience = 'shared'
    AND EXISTS (
      SELECT 1 FROM public.carrier_edo_documents d
      WHERE d.id = edo_snapshot_reviews.document_id
        AND d.carrier_ext_id = public.carrier_my_ext_id()
    )
  );

DROP POLICY IF EXISTS edo_snapshot_reviews_carrier_ins ON public.edo_snapshot_reviews;
CREATE POLICY edo_snapshot_reviews_carrier_ins
  ON public.edo_snapshot_reviews FOR INSERT
  WITH CHECK (
    audience = 'shared'
    AND checked_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.carrier_edo_documents d
      WHERE d.id = edo_snapshot_reviews.document_id
        AND d.carrier_ext_id = public.carrier_my_ext_id()
    )
  );

DROP POLICY IF EXISTS edo_snapshot_reviews_dispatcher_all ON public.edo_snapshot_reviews;
CREATE POLICY edo_snapshot_reviews_dispatcher_all
  ON public.edo_snapshot_reviews FOR ALL
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'dispatcher')
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'dispatcher')
  );

CREATE OR REPLACE FUNCTION public.tg_edo_snapshot_reviews_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS edo_snapshot_reviews_touch ON public.edo_snapshot_reviews;
CREATE TRIGGER edo_snapshot_reviews_touch
  BEFORE UPDATE ON public.edo_snapshot_reviews
  FOR EACH ROW EXECUTE FUNCTION public.tg_edo_snapshot_reviews_touch();
