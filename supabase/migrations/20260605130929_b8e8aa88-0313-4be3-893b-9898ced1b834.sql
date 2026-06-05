
-- ============= 1. Add consent fields on dispatcher_carrier_ext =============
ALTER TABLE public.dispatcher_carrier_ext
  ADD COLUMN IF NOT EXISTS commission_agreed_at timestamptz,
  ADD COLUMN IF NOT EXISTS commission_agreed_by text,
  ADD COLUMN IF NOT EXISTS commission_agreement_text text,
  ADD COLUMN IF NOT EXISTS commission_payment_method text;

-- ============= 2. Add docs_status / docs_comment on driver_ext, vehicle_ext =============
ALTER TABLE public.dispatcher_driver_ext
  ADD COLUMN IF NOT EXISTS docs_status text NOT NULL DEFAULT 'not_uploaded',
  ADD COLUMN IF NOT EXISTS docs_comment text;

ALTER TABLE public.dispatcher_vehicle_ext
  ADD COLUMN IF NOT EXISTS docs_status text NOT NULL DEFAULT 'not_uploaded',
  ADD COLUMN IF NOT EXISTS docs_comment text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dispatcher_driver_docs_status_chk') THEN
    ALTER TABLE public.dispatcher_driver_ext
      ADD CONSTRAINT dispatcher_driver_docs_status_chk
      CHECK (docs_status IN ('not_uploaded','uploaded','checking','approved','rejected'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dispatcher_vehicle_docs_status_chk') THEN
    ALTER TABLE public.dispatcher_vehicle_ext
      ADD CONSTRAINT dispatcher_vehicle_docs_status_chk
      CHECK (docs_status IN ('not_uploaded','uploaded','checking','approved','rejected'));
  END IF;
END $$;

-- ============= 3. dispatcher_invite_tokens table =============
CREATE TABLE IF NOT EXISTS public.dispatcher_invite_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text UNIQUE NOT NULL,
  invite_type text NOT NULL,
  related_entity_type text NOT NULL,
  related_entity_id uuid NOT NULL,
  expires_at timestamptz,
  used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dispatcher_invite_type_chk CHECK (invite_type IN (
    'carrier_registration','driver_registration','vehicle_registration','carrier_driver_registration'
  )),
  CONSTRAINT dispatcher_invite_entity_chk CHECK (related_entity_type IN ('carrier','driver','vehicle'))
);

CREATE INDEX IF NOT EXISTS idx_disp_invite_tokens_entity ON public.dispatcher_invite_tokens(related_entity_type, related_entity_id);
CREATE INDEX IF NOT EXISTS idx_disp_invite_tokens_token ON public.dispatcher_invite_tokens(token);

GRANT SELECT, INSERT, UPDATE ON public.dispatcher_invite_tokens TO authenticated;
GRANT ALL ON public.dispatcher_invite_tokens TO service_role;

ALTER TABLE public.dispatcher_invite_tokens ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='dispatcher_invite_tokens' AND policyname='dispatcher_invite_tokens read') THEN
    CREATE POLICY "dispatcher_invite_tokens read" ON public.dispatcher_invite_tokens
      FOR SELECT TO authenticated
      USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='dispatcher_invite_tokens' AND policyname='dispatcher_invite_tokens write') THEN
    CREATE POLICY "dispatcher_invite_tokens write" ON public.dispatcher_invite_tokens
      FOR ALL TO authenticated
      USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role))
      WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role));
  END IF;
END $$;

DROP TRIGGER IF EXISTS dispatcher_invite_tokens_set_updated_at ON public.dispatcher_invite_tokens;
CREATE TRIGGER dispatcher_invite_tokens_set_updated_at
  BEFORE UPDATE ON public.dispatcher_invite_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= 4. SECURITY DEFINER: public resolve =============
CREATE OR REPLACE FUNCTION public.dispatcher_invite_resolve(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tok public.dispatcher_invite_tokens%ROWTYPE;
  v_entity jsonb;
BEGIN
  SELECT * INTO v_tok FROM public.dispatcher_invite_tokens WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF v_tok.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'revoked');
  END IF;
  IF v_tok.used_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'used');
  END IF;
  IF v_tok.expires_at IS NOT NULL AND v_tok.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;

  IF v_tok.related_entity_type = 'carrier' THEN
    SELECT to_jsonb(c) - 'production_carrier_id' INTO v_entity
      FROM public.dispatcher_carrier_ext c WHERE c.id = v_tok.related_entity_id;
  ELSIF v_tok.related_entity_type = 'driver' THEN
    SELECT to_jsonb(d) - 'production_driver_id' INTO v_entity
      FROM public.dispatcher_driver_ext d WHERE d.id = v_tok.related_entity_id;
  ELSIF v_tok.related_entity_type = 'vehicle' THEN
    SELECT to_jsonb(v) - 'production_vehicle_id' INTO v_entity
      FROM public.dispatcher_vehicle_ext v WHERE v.id = v_tok.related_entity_id;
  END IF;

  IF v_entity IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'entity_missing');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'invite_type', v_tok.invite_type,
    'entity_type', v_tok.related_entity_type,
    'entity_id', v_tok.related_entity_id,
    'expires_at', v_tok.expires_at,
    'entity', v_entity
  );
END $$;

REVOKE ALL ON FUNCTION public.dispatcher_invite_resolve(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dispatcher_invite_resolve(text) TO anon, authenticated;

-- ============= 5. SECURITY DEFINER: public save =============
CREATE OR REPLACE FUNCTION public.dispatcher_invite_save(p_token text, p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tok public.dispatcher_invite_tokens%ROWTYPE;
  v_allowed text[];
  v_set text := '';
  v_key text;
  v_val jsonb;
  v_sql text;
BEGIN
  SELECT * INTO v_tok FROM public.dispatcher_invite_tokens WHERE token = p_token;
  IF NOT FOUND OR v_tok.revoked_at IS NOT NULL OR v_tok.used_at IS NOT NULL
     OR (v_tok.expires_at IS NOT NULL AND v_tok.expires_at < now()) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_token');
  END IF;

  IF v_tok.related_entity_type = 'carrier' THEN
    v_allowed := ARRAY['name','carrier_kind','inn','ogrn','phone','email','city',
      'whatsapp','telegram','max_messenger','bank_name','bank_account','bank_bik',
      'bank_corr_account','payment_method','commission_payment_method'];
  ELSIF v_tok.related_entity_type = 'driver' THEN
    v_allowed := ARRAY['full_name','phone','email','whatsapp','telegram','max_messenger',
      'city','docs_comment'];
  ELSIF v_tok.related_entity_type = 'vehicle' THEN
    v_allowed := ARRAY['vehicle_kind','body_type','payload_kg','volume_m3','length_m',
      'width_m','height_m','load_methods','home_city','ready_to_cities','ready_date',
      'minimum_trip_rate','minimum_km_rate','city_rate','point_rate','rate_comment',
      'docs_comment'];
  ELSE
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_entity');
  END IF;

  FOR v_key, v_val IN SELECT * FROM jsonb_each(p_data) LOOP
    IF v_key = ANY(v_allowed) THEN
      IF v_set <> '' THEN v_set := v_set || ', '; END IF;
      -- cast jsonb to text via #>>'{}' for scalars; arrays handled separately
      IF jsonb_typeof(v_val) = 'array' THEN
        v_set := v_set || quote_ident(v_key) || ' = (SELECT array_agg(value::text) FROM jsonb_array_elements_text('
          || quote_literal(v_val::text) || '::jsonb))';
      ELSIF jsonb_typeof(v_val) = 'null' THEN
        v_set := v_set || quote_ident(v_key) || ' = NULL';
      ELSE
        v_set := v_set || quote_ident(v_key) || ' = ' || quote_literal(v_val#>>'{}');
      END IF;
    END IF;
  END LOOP;

  IF v_set = '' THEN
    RETURN jsonb_build_object('ok', true, 'updated', 0);
  END IF;

  IF v_tok.related_entity_type = 'carrier' THEN
    v_sql := 'UPDATE public.dispatcher_carrier_ext SET ' || v_set || ' WHERE id = $1';
  ELSIF v_tok.related_entity_type = 'driver' THEN
    v_sql := 'UPDATE public.dispatcher_driver_ext SET ' || v_set || ' WHERE id = $1';
  ELSE
    v_sql := 'UPDATE public.dispatcher_vehicle_ext SET ' || v_set || ' WHERE id = $1';
  END IF;

  EXECUTE v_sql USING v_tok.related_entity_id;
  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION public.dispatcher_invite_save(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dispatcher_invite_save(text, jsonb) TO anon, authenticated;

-- ============= 6. SECURITY DEFINER: public complete =============
CREATE OR REPLACE FUNCTION public.dispatcher_invite_complete(p_token text, p_consent jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tok public.dispatcher_invite_tokens%ROWTYPE;
  v_consent_by text;
  v_consent_text text;
BEGIN
  SELECT * INTO v_tok FROM public.dispatcher_invite_tokens WHERE token = p_token;
  IF NOT FOUND OR v_tok.revoked_at IS NOT NULL OR v_tok.used_at IS NOT NULL
     OR (v_tok.expires_at IS NOT NULL AND v_tok.expires_at < now()) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_token');
  END IF;

  IF v_tok.related_entity_type = 'carrier' THEN
    v_consent_by := COALESCE(p_consent->>'agreed_by', '');
    v_consent_text := COALESCE(p_consent->>'agreement_text', '');
    IF NOT COALESCE((p_consent->>'agreed')::boolean, false) OR length(v_consent_by) = 0 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'consent_required');
    END IF;
    UPDATE public.dispatcher_carrier_ext
      SET commission_agreed = true,
          commission_agreed_at = now(),
          commission_agreed_by = v_consent_by,
          commission_agreement_text = NULLIF(v_consent_text, ''),
          verification_status = 'on_check'
      WHERE id = v_tok.related_entity_id;
  ELSIF v_tok.related_entity_type = 'driver' THEN
    UPDATE public.dispatcher_driver_ext
      SET dispatcher_status = CASE WHEN dispatcher_status = 'new' THEN 'docs_unchecked' ELSE dispatcher_status END,
          docs_status = CASE WHEN docs_status = 'not_uploaded' THEN 'uploaded' ELSE docs_status END
      WHERE id = v_tok.related_entity_id;
  ELSIF v_tok.related_entity_type = 'vehicle' THEN
    UPDATE public.dispatcher_vehicle_ext
      SET dispatcher_status = CASE WHEN dispatcher_status = 'new' THEN 'docs_unchecked' ELSE dispatcher_status END,
          docs_status = CASE WHEN docs_status = 'not_uploaded' THEN 'uploaded' ELSE docs_status END
      WHERE id = v_tok.related_entity_id;
  END IF;

  UPDATE public.dispatcher_invite_tokens SET used_at = now() WHERE id = v_tok.id;
  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION public.dispatcher_invite_complete(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dispatcher_invite_complete(text, jsonb) TO anon, authenticated;
