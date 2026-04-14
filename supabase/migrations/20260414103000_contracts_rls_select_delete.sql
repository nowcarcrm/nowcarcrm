-- contracts: authenticated SELECT/DELETE for RLS (insert/update policies exist in crm_stabilization).

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'contracts'
      and policyname = 'contracts_authenticated_select'
  ) then
    create policy contracts_authenticated_select
      on public.contracts
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'contracts'
      and policyname = 'contracts_authenticated_delete'
  ) then
    create policy contracts_authenticated_delete
      on public.contracts
      for delete
      to authenticated
      using (true);
  end if;
end
$$;
