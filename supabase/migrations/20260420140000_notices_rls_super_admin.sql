-- 공지: super_admin도 INSERT/UPDATE 가능, DELETE는 super_admin만 (기존 admin-only 정책 보완)

drop policy if exists "Allow insert for admin" on public.notices;
drop policy if exists "Allow update for admin" on public.notices;
drop policy if exists "Allow delete for admin" on public.notices;

create policy "Allow insert for admin or super_admin"
  on public.notices
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and (u.role = 'admin' or u.role = 'super_admin')
    )
  );

create policy "Allow update for admin or super_admin"
  on public.notices
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and (u.role = 'admin' or u.role = 'super_admin')
    )
  );

create policy "Allow delete for super_admin only"
  on public.notices
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.role = 'super_admin'
    )
  );
