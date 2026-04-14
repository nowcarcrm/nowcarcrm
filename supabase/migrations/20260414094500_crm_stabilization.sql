alter table if exists public.leads
  add column if not exists memo text,
  add column if not exists contract_period text,
  add column if not exists deposit numeric;

create table if not exists public.estimates (
  id uuid primary key default gen_random_uuid(),
  lead_id bigint not null references public.leads(id) on delete cascade,
  quoted_at date not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists estimates_lead_id_idx on public.estimates(lead_id);
create index if not exists estimates_quoted_at_idx on public.estimates(quoted_at desc);

alter table if exists public.contracts enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'contracts'
      and policyname = 'contracts_authenticated_insert'
  ) then
    create policy contracts_authenticated_insert
      on public.contracts
      for insert
      to authenticated
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'contracts'
      and policyname = 'contracts_authenticated_update'
  ) then
    create policy contracts_authenticated_update
      on public.contracts
      for update
      to authenticated
      using (true)
      with check (true);
  end if;
end
$$;
