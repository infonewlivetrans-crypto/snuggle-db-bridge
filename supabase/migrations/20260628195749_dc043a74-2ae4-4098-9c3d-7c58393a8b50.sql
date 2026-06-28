
-- Связка ГосЛог с справочником экспедитора и индексы.
ALTER TABLE public.forwarder_goslog_status
  ADD COLUMN IF NOT EXISTS dispatcher_forwarder_ext_id uuid
    REFERENCES public.dispatcher_forwarder_ext(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_forwarder_goslog_status_dispatcher_ext_id
  ON public.forwarder_goslog_status(dispatcher_forwarder_ext_id);
CREATE INDEX IF NOT EXISTS idx_forwarder_goslog_status_inn
  ON public.forwarder_goslog_status(inn);

-- Безопасный поиск экспедиторов для carrier-контекста: SECURITY DEFINER,
-- отдаёт ограниченный набор полей; внутренние комментарии диспетчера не возвращает.
CREATE OR REPLACE FUNCTION public.search_forwarders_for_carrier(p_query text)
RETURNS TABLE (
  id uuid,
  company_name text,
  inn text,
  ogrn text,
  legal_form text,
  phone text,
  email text,
  contact_person text,
  city text,
  okved_codes jsonb,
  has_okved_5229 boolean,
  status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.id, f.company_name, f.inn, f.ogrn, f.legal_form,
         f.phone, f.email, f.contact_person, f.city,
         f.okved_codes, f.has_okved_5229, f.status
  FROM public.dispatcher_forwarder_ext f
  WHERE f.status <> 'archive'
    AND (
      coalesce(p_query, '') = ''
      OR f.company_name ILIKE '%' || p_query || '%'
      OR coalesce(f.inn, '') ILIKE '%' || p_query || '%'
      OR coalesce(f.contact_person, '') ILIKE '%' || p_query || '%'
    )
  ORDER BY f.company_name
  LIMIT 50;
$$;

GRANT EXECUTE ON FUNCTION public.search_forwarders_for_carrier(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_forwarder_for_carrier(p_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'forwarder', to_jsonb(row)
                  - 'dispatcher_comment'
                  - 'created_by'
                  - 'archived_at',
    'goslog', (
      SELECT to_jsonb(g) - 'verified_by'
      FROM public.forwarder_goslog_status g
      WHERE g.dispatcher_forwarder_ext_id = row.id
         OR (row.inn IS NOT NULL AND g.inn = row.inn)
      ORDER BY g.updated_at DESC
      LIMIT 1
    )
  )
  FROM public.dispatcher_forwarder_ext row
  WHERE row.id = p_id AND row.status <> 'archive';
$$;

GRANT EXECUTE ON FUNCTION public.get_forwarder_for_carrier(uuid) TO authenticated;
