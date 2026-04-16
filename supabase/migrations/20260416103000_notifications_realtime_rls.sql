-- notifications: RLS SELECT for authenticated + supabase_realtime publication
-- Vercel serverless keeps no long-lived Socket.IO; clients use Supabase Realtime INSERT events.

alter table public.notifications enable row level security;

drop policy if exists notifications_select_own on public.notifications;

create policy notifications_select_own
  on public.notifications
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.id = notifications.user_id
        and u.auth_user_id = auth.uid()
    )
  );

do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception
  when duplicate_object then
    null;
  when others then
    if sqlerrm ilike '%already%' or sqlerrm ilike '%member%' then
      null;
    else
      raise;
    end if;
end;
$$;
