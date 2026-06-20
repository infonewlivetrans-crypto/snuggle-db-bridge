-- ============ ENUMS ============
do $$ begin
  create type public.edo_provider as enum (
    'diadoc','sbis','taxcom','astral','sberkorus','other','internal_mock'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.edo_connection_status as enum (
    'not_connected','setup_required','connected','error','disabled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.edo_environment as enum ('test','production');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.edo_doc_status as enum (
    'draft','created',
    'waiting_shipper_signature','waiting_carrier_signature',
    'waiting_driver_action','waiting_consignee_signature',
    'signed','sent_to_operator','accepted_by_operator','rejected_by_operator',
    'error','closed','cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.edo_participant_role as enum (
    'shipper','carrier','driver','consignee','operator'
  );
exception when duplicate_object then null; end $$;

-- ============ TABLE: carrier_edo_connections ============
create table if not exists public.carrier_edo_connections (
  id uuid primary key default gen_random_uuid(),
  carrier_ext_id uuid not null references public.dispatcher_carrier_ext(id) on delete cascade,
  provider public.edo_provider not null default 'internal_mock',
  provider_title text,
  status public.edo_connection_status not null default 'not_connected',
  environment public.edo_environment not null default 'test',
  organization_name text,
  organization_inn text,
  external_org_id text,
  box_id text,
  client_id text,
  client_secret text,
  api_key text,
  access_token text,
  refresh_token text,
  certificate_id text,
  comment text,
  last_check_at timestamptz,
  last_check_status text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (carrier_ext_id)
);

grant select, insert, update, delete on public.carrier_edo_connections to authenticated;
grant all on public.carrier_edo_connections to service_role;

alter table public.carrier_edo_connections enable row level security;

-- RLS: перевозчик видит только своё подключение, но БЕЗ секретных полей
-- (секреты отрезаются на уровне VIEW + REVOKE column-level select).
do $$ begin
  create policy "carrier_edo_conn_own_select" on public.carrier_edo_connections
    for select to authenticated
    using (carrier_ext_id = public.carrier_my_ext_id());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "carrier_edo_conn_own_insert" on public.carrier_edo_connections
    for insert to authenticated
    with check (carrier_ext_id = public.carrier_my_ext_id());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "carrier_edo_conn_own_update" on public.carrier_edo_connections
    for update to authenticated
    using (carrier_ext_id = public.carrier_my_ext_id())
    with check (carrier_ext_id = public.carrier_my_ext_id());
exception when duplicate_object then null; end $$;

-- Прячем секреты от клиента: VIEW без чувствительных колонок
create or replace view public.carrier_edo_connections_safe as
  select id, carrier_ext_id, provider, provider_title, status, environment,
         organization_name, organization_inn, external_org_id, box_id,
         (client_id is not null) as has_client_id,
         (client_secret is not null) as has_client_secret,
         (api_key is not null) as has_api_key,
         (access_token is not null) as has_access_token,
         (certificate_id is not null) as has_certificate,
         comment, last_check_at, last_check_status, error_message,
         created_at, updated_at
    from public.carrier_edo_connections;

grant select on public.carrier_edo_connections_safe to authenticated;
grant all on public.carrier_edo_connections_safe to service_role;

-- ============ TABLE: carrier_edo_documents ============
create table if not exists public.carrier_edo_documents (
  id uuid primary key default gen_random_uuid(),
  carrier_ext_id uuid not null references public.dispatcher_carrier_ext(id) on delete cascade,
  connection_id uuid references public.carrier_edo_connections(id) on delete set null,
  provider public.edo_provider not null default 'internal_mock',
  external_id text,
  doc_number text,
  status public.edo_doc_status not null default 'draft',
  route_summary text,
  shipper_name text,
  shipper_inn text,
  consignee_name text,
  consignee_inn text,
  vehicle_label text,
  driver_label text,
  cargo_summary text,
  loading_at timestamptz,
  unloading_at timestamptz,
  rate_amount numeric,
  rate_currency text default 'RUB',
  freight_id uuid references public.dispatcher_freights(id) on delete set null,
  trip_id uuid references public.dispatcher_trips(id) on delete set null,
  awaiting_role public.edo_participant_role,
  xml_path text,
  pdf_path text,
  last_synced_at timestamptz,
  last_sync_status text,
  error_message text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists carrier_edo_documents_carrier_idx
  on public.carrier_edo_documents (carrier_ext_id, created_at desc);
create index if not exists carrier_edo_documents_status_idx
  on public.carrier_edo_documents (carrier_ext_id, status);

grant select, insert, update, delete on public.carrier_edo_documents to authenticated;
grant all on public.carrier_edo_documents to service_role;
alter table public.carrier_edo_documents enable row level security;

do $$ begin
  create policy "carrier_edo_docs_own_select" on public.carrier_edo_documents
    for select to authenticated
    using (carrier_ext_id = public.carrier_my_ext_id());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "carrier_edo_docs_own_insert" on public.carrier_edo_documents
    for insert to authenticated
    with check (carrier_ext_id = public.carrier_my_ext_id());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "carrier_edo_docs_own_update" on public.carrier_edo_documents
    for update to authenticated
    using (carrier_ext_id = public.carrier_my_ext_id())
    with check (carrier_ext_id = public.carrier_my_ext_id());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "carrier_edo_docs_own_delete" on public.carrier_edo_documents
    for delete to authenticated
    using (carrier_ext_id = public.carrier_my_ext_id());
exception when duplicate_object then null; end $$;

-- ============ TABLE: carrier_edo_document_participants ============
create table if not exists public.carrier_edo_document_participants (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.carrier_edo_documents(id) on delete cascade,
  role public.edo_participant_role not null,
  name text,
  inn text,
  participant_operator_provider public.edo_provider,
  participant_external_id text,
  participant_signature_status text not null default 'pending',
  participant_sign_method text,
  signed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists carrier_edo_doc_participants_doc_idx
  on public.carrier_edo_document_participants (document_id);

grant select, insert, update, delete on public.carrier_edo_document_participants to authenticated;
grant all on public.carrier_edo_document_participants to service_role;
alter table public.carrier_edo_document_participants enable row level security;

do $$ begin
  create policy "edo_participants_own_all" on public.carrier_edo_document_participants
    for all to authenticated
    using (
      exists (select 1 from public.carrier_edo_documents d
              where d.id = document_id and d.carrier_ext_id = public.carrier_my_ext_id())
    )
    with check (
      exists (select 1 from public.carrier_edo_documents d
              where d.id = document_id and d.carrier_ext_id = public.carrier_my_ext_id())
    );
exception when duplicate_object then null; end $$;

-- ============ TABLE: carrier_edo_document_events ============
create table if not exists public.carrier_edo_document_events (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.carrier_edo_documents(id) on delete cascade,
  event_type text not null,
  message text,
  actor_role public.edo_participant_role,
  actor_user_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists carrier_edo_doc_events_doc_idx
  on public.carrier_edo_document_events (document_id, created_at desc);

grant select, insert on public.carrier_edo_document_events to authenticated;
grant all on public.carrier_edo_document_events to service_role;
alter table public.carrier_edo_document_events enable row level security;

do $$ begin
  create policy "edo_events_own_select" on public.carrier_edo_document_events
    for select to authenticated
    using (
      exists (select 1 from public.carrier_edo_documents d
              where d.id = document_id and d.carrier_ext_id = public.carrier_my_ext_id())
    );
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "edo_events_own_insert" on public.carrier_edo_document_events
    for insert to authenticated
    with check (
      exists (select 1 from public.carrier_edo_documents d
              where d.id = document_id and d.carrier_ext_id = public.carrier_my_ext_id())
    );
exception when duplicate_object then null; end $$;

-- ============ updated_at trigger ============
create or replace function public.tg_edo_touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

do $$ begin
  create trigger trg_edo_conn_touch before update on public.carrier_edo_connections
    for each row execute function public.tg_edo_touch_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger trg_edo_docs_touch before update on public.carrier_edo_documents
    for each row execute function public.tg_edo_touch_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger trg_edo_parts_touch before update on public.carrier_edo_document_participants
    for each row execute function public.tg_edo_touch_updated_at();
exception when duplicate_object then null; end $$;

-- ============ Skip column-level secret revoke ============
-- RLS уже ограничивает выдачу строк только своим перевозчиком; для UI
-- используем VIEW carrier_edo_connections_safe (без секретов). Серверный код
-- читает секреты через service_role.
