alter table public.carrier_edo_connections
  drop constraint if exists carrier_edo_connections_carrier_ext_id_key;

alter table public.carrier_edo_connections
  add column if not exists is_default boolean not null default false;

create unique index if not exists carrier_edo_conn_one_default_per_carrier
  on public.carrier_edo_connections (carrier_ext_id)
  where is_default = true;

drop view if exists public.carrier_edo_connections_safe;
create view public.carrier_edo_connections_safe as
  select id, carrier_ext_id, provider, provider_title, status, environment,
         is_default,
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

do $$ begin
  create type public.edo_doc_direction as enum ('incoming','outgoing','internal');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.edo_doc_type as enum
    ('etrn','upd','act','contract','invoice','transport_waybill','other');
exception when duplicate_object then null; end $$;

alter table public.carrier_edo_documents
  add column if not exists direction public.edo_doc_direction not null default 'outgoing',
  add column if not exists document_type public.edo_doc_type not null default 'etrn',
  add column if not exists title text,
  add column if not exists document_date date,
  add column if not exists loading_city text,
  add column if not exists unloading_city text,
  add column if not exists payload_json jsonb not null default '{}'::jsonb,
  add column if not exists operator_response_json jsonb not null default '{}'::jsonb,
  add column if not exists closed_at timestamptz;

create index if not exists carrier_edo_docs_direction_idx
  on public.carrier_edo_documents (carrier_ext_id, direction, created_at desc);

create table if not exists public.edo_counterparties (
  id uuid primary key default gen_random_uuid(),
  carrier_ext_id uuid references public.dispatcher_carrier_ext(id) on delete cascade,
  name text not null,
  inn text,
  kpp text,
  type text not null default 'other',
  edo_provider public.edo_provider,
  edo_provider_title text,
  external_org_id text,
  box_id text,
  email text,
  phone text,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists edo_counterparties_carrier_idx
  on public.edo_counterparties (carrier_ext_id, name);

grant select, insert, update, delete on public.edo_counterparties to authenticated;
grant all on public.edo_counterparties to service_role;
alter table public.edo_counterparties enable row level security;

do $$ begin
  create policy "edo_cp_own_select" on public.edo_counterparties
    for select to authenticated
    using (carrier_ext_id is null or carrier_ext_id = public.carrier_my_ext_id());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "edo_cp_own_insert" on public.edo_counterparties
    for insert to authenticated
    with check (carrier_ext_id = public.carrier_my_ext_id());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "edo_cp_own_update" on public.edo_counterparties
    for update to authenticated
    using (carrier_ext_id = public.carrier_my_ext_id())
    with check (carrier_ext_id = public.carrier_my_ext_id());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "edo_cp_own_delete" on public.edo_counterparties
    for delete to authenticated
    using (carrier_ext_id = public.carrier_my_ext_id());
exception when duplicate_object then null; end $$;