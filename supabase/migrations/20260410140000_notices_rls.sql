-- notices: RLS (로그인 사용자 조회, 관리자만 쓰기)
-- 전제: public.users.id = auth.uid(), users.role in ('admin','manager','staff')

alter table public.notices enable row level security;

create policy "Allow read for authenticated users"
  on public.notices
  for select
  to authenticated
  using (is_active = true);

create policy "Allow insert for admin"
  on public.notices
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.users
      where users.id = auth.uid()
        and users.role = 'admin'
    )
  );

create policy "Allow update for admin"
  on public.notices
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.users
      where users.id = auth.uid()
        and users.role = 'admin'
    )
  );

create policy "Allow delete for admin"
  on public.notices
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.users
      where users.id = auth.uid()
        and users.role = 'admin'
    )
  );
