create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  from_date date not null,
  to_date date not null,
  reason text null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  approved_by uuid null references public.users(id) on delete set null,
  approved_at timestamptz null,
  rejected_by uuid null references public.users(id) on delete set null,
  rejected_at timestamptz null,
  rejection_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leave_requests_date_range_check check (to_date >= from_date)
);

create index if not exists idx_leave_requests_user_id on public.leave_requests(user_id);
create index if not exists idx_leave_requests_status on public.leave_requests(status);
create index if not exists idx_leave_requests_from_to on public.leave_requests(from_date, to_date);

create or replace function public.set_leave_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_leave_requests_updated_at on public.leave_requests;
create trigger trg_leave_requests_updated_at
before update on public.leave_requests
for each row
execute function public.set_leave_requests_updated_at();

alter table public.leave_requests enable row level security;

drop policy if exists leave_requests_select_own_or_approver on public.leave_requests;
create policy leave_requests_select_own_or_approver
on public.leave_requests
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.rank in ('본부장', '대표', '총괄대표')
  )
);

drop policy if exists leave_requests_insert_own on public.leave_requests;
create policy leave_requests_insert_own
on public.leave_requests
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists leave_requests_update_approver on public.leave_requests;
create policy leave_requests_update_approver
on public.leave_requests
for update
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.rank in ('본부장', '대표', '총괄대표')
  )
)
with check (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.rank in ('본부장', '대표', '총괄대표')
  )
);
