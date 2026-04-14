-- super admin / position permission hardening

alter table public.users
add column if not exists position text;

update public.users
set role = 'super_admin',
    position = '총괄대표'
where lower(coalesce(email, '')) = 'jyy1964@naver.com';

update public.users
set role = 'staff'
where role = 'manager';

alter table public.users
drop constraint if exists users_role_check;

alter table public.users
add constraint users_role_check
check (role in ('super_admin', 'admin', 'staff'));

alter table public.users
drop constraint if exists users_position_check;

alter table public.users
add constraint users_position_check
check (
  position is null
  or position in ('주임', '대리', '과장', '차장', '팀장', '본부장', '대표', '총괄대표')
);

create or replace function public.crm_enforce_super_admin_user()
returns trigger
language plpgsql
as $$
begin
  if lower(coalesce(new.email, '')) = 'jyy1964@naver.com' then
    new.role := 'super_admin';
    new.position := '총괄대표';
  elsif new.role = 'super_admin' and coalesce(new.position, '') <> '총괄대표' then
    new.position := '총괄대표';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crm_enforce_super_admin_user on public.users;
create trigger trg_crm_enforce_super_admin_user
before insert or update on public.users
for each row
execute function public.crm_enforce_super_admin_user();

create or replace function public.crm_block_protected_super_admin_mutation()
returns trigger
language plpgsql
as $$
declare
  current_super_count integer;
begin
  if tg_op = 'DELETE' then
    if old.role = 'super_admin' then
      select count(*)
      into current_super_count
      from public.users
      where role = 'super_admin';

      if current_super_count <= 1 then
        raise exception '마지막 super_admin 계정은 삭제할 수 없습니다.';
      end if;
    end if;
    return old;
  end if;

  if old.role = 'super_admin' then
    if lower(coalesce(old.email, '')) = 'jyy1964@naver.com' then
      if new.role is distinct from old.role
         or new.position is distinct from old.position
         or new.email is distinct from old.email then
        raise exception '보호된 super_admin 계정은 role/position/email을 수정할 수 없습니다.';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_crm_block_protected_super_admin_mutation on public.users;
create trigger trg_crm_block_protected_super_admin_mutation
before update or delete on public.users
for each row
execute function public.crm_block_protected_super_admin_mutation();
