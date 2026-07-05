
-- 1) Table
CREATE TABLE IF NOT EXISTS public.ai_dispatch_agent_pair_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatcher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  origin text NOT NULL,
  challenge_secret_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','connected','expired','failed')),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  connected_session_id uuid,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_dispatch_agent_pair_challenges_dispatcher_idx
  ON public.ai_dispatch_agent_pair_challenges (dispatcher_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_dispatch_agent_pair_challenges_status_idx
  ON public.ai_dispatch_agent_pair_challenges (status, expires_at);

-- 2) Grants
GRANT SELECT ON public.ai_dispatch_agent_pair_challenges TO authenticated;
GRANT ALL ON public.ai_dispatch_agent_pair_challenges TO service_role;

-- 3) RLS
ALTER TABLE public.ai_dispatch_agent_pair_challenges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dispatcher_reads_own_challenges" ON public.ai_dispatch_agent_pair_challenges;
CREATE POLICY "dispatcher_reads_own_challenges"
  ON public.ai_dispatch_agent_pair_challenges
  FOR SELECT
  TO authenticated
  USING (dispatcher_id = auth.uid());

-- Никаких INSERT/UPDATE/DELETE политик: всё делается через SECURITY DEFINER RPC.

-- 4) updated_at trigger
CREATE OR REPLACE FUNCTION public.ai_dispatch_agent_pair_challenges_touch()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS ai_dispatch_agent_pair_challenges_touch_trg
  ON public.ai_dispatch_agent_pair_challenges;
CREATE TRIGGER ai_dispatch_agent_pair_challenges_touch_trg
  BEFORE UPDATE ON public.ai_dispatch_agent_pair_challenges
  FOR EACH ROW EXECUTE FUNCTION public.ai_dispatch_agent_pair_challenges_touch();

-- 5) RPC: создание challenge авторизованным диспетчером.
--    Возвращает id и expires_at. Сам secret считается на сервере API (не в RPC),
--    сюда передаётся уже готовый hash.
CREATE OR REPLACE FUNCTION public.agent_create_pair_challenge(
  _challenge_secret_hash text,
  _origin text,
  _ttl_seconds int DEFAULT 120
)
RETURNS TABLE(id uuid, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_exp timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '28000';
  END IF;
  IF _challenge_secret_hash IS NULL OR length(_challenge_secret_hash) < 32 THEN
    RAISE EXCEPTION 'invalid_challenge_hash' USING ERRCODE = '22023';
  END IF;
  IF _origin IS NULL OR length(_origin) = 0 THEN
    RAISE EXCEPTION 'invalid_origin' USING ERRCODE = '22023';
  END IF;

  v_exp := now() + make_interval(secs => GREATEST(30, LEAST(600, _ttl_seconds)));

  INSERT INTO public.ai_dispatch_agent_pair_challenges
    (dispatcher_id, origin, challenge_secret_hash, expires_at)
  VALUES (v_uid, _origin, _challenge_secret_hash, v_exp)
  RETURNING ai_dispatch_agent_pair_challenges.id, ai_dispatch_agent_pair_challenges.expires_at
  INTO v_id, v_exp;

  -- Возвращаем через RETURN QUERY, потому что RETURNS TABLE.
  id := v_id;
  expires_at := v_exp;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.agent_create_pair_challenge(text, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agent_create_pair_challenge(text, text, int) TO authenticated;

-- 6) RPC: атомарный consume challenge расширением.
--    Создаёт или обновляет agent session, сохраняет hash токена, помечает challenge использованным.
CREATE OR REPLACE FUNCTION public.agent_consume_pair_challenge(
  _challenge_id uuid,
  _challenge_secret_hash text,
  _origin text,
  _agent_token_hash text,
  _agent_version text,
  _protocol_version text,
  _browser_name text,
  _token_ttl_seconds int DEFAULT 2592000  -- 30 days
)
RETURNS TABLE(session_id uuid, dispatcher_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ch RECORD;
  v_session_id uuid;
  v_dispatcher uuid;
  v_expires timestamptz;
BEGIN
  -- Атомарная блокировка challenge-строки.
  SELECT * INTO v_ch
    FROM public.ai_dispatch_agent_pair_challenges
    WHERE id = _challenge_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'challenge_not_found' USING ERRCODE = '22023';
  END IF;

  IF v_ch.status <> 'pending' OR v_ch.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'challenge_already_used' USING ERRCODE = '22023';
  END IF;

  IF v_ch.expires_at < now() THEN
    UPDATE public.ai_dispatch_agent_pair_challenges
      SET status = 'expired', failure_reason = 'ttl'
      WHERE id = _challenge_id;
    RAISE EXCEPTION 'challenge_expired' USING ERRCODE = '22023';
  END IF;

  IF v_ch.challenge_secret_hash <> _challenge_secret_hash THEN
    UPDATE public.ai_dispatch_agent_pair_challenges
      SET status = 'failed', failure_reason = 'bad_secret'
      WHERE id = _challenge_id;
    RAISE EXCEPTION 'challenge_secret_mismatch' USING ERRCODE = '22023';
  END IF;

  IF v_ch.origin <> _origin THEN
    UPDATE public.ai_dispatch_agent_pair_challenges
      SET status = 'failed', failure_reason = 'origin_mismatch'
      WHERE id = _challenge_id;
    RAISE EXCEPTION 'origin_mismatch' USING ERRCODE = '22023';
  END IF;

  v_dispatcher := v_ch.dispatcher_id;
  v_expires := now() + make_interval(secs => GREATEST(3600, _token_ttl_seconds));

  INSERT INTO public.ai_dispatch_agent_sessions (
    dispatcher_id, agent_type, agent_name,
    status, paired_at, last_heartbeat_at,
    agent_version, browser_name,
    agent_token_hash, agent_token_expires_at
  ) VALUES (
    v_dispatcher, 'browser_extension', 'Radius Track Browser Agent',
    'connected', now(), now(),
    _agent_version, _browser_name,
    _agent_token_hash, v_expires
  )
  RETURNING id INTO v_session_id;

  UPDATE public.ai_dispatch_agent_pair_challenges
    SET status = 'connected',
        used_at = now(),
        connected_session_id = v_session_id
    WHERE id = _challenge_id;

  session_id := v_session_id;
  dispatcher_id := v_dispatcher;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.agent_consume_pair_challenge(uuid, text, text, text, text, text, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agent_consume_pair_challenge(uuid, text, text, text, text, text, text, int) TO anon, authenticated;
