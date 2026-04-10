-- 직원 가입 승인: public.users.approval_status
-- 기존 행은 모두 approved 로 간주 (백필)

alter table public.users
  add column if not exists approval_status text;

update public.users
set approval_status = 'approved'
where approval_status is null;

alter table public.users
  alter column approval_status set default 'pending';

alter table public.users drop constraint if exists users_approval_status_check;

alter table public.users
  add constraint users_approval_status_check
  check (approval_status in ('pending', 'approved', 'rejected'))
  not valid;

alter table public.users
  validate constraint users_approval_status_check;

alter table public.users
  alter column approval_status set not null;

-- 관리자가 Auth에만 만든 계정은 API에서 users 행을 넣습니다.
-- 트리거는 공개 회원가입 등 admin_created 가 아닌 경우에만 users 행을 만듭니다.
create or replace function public.crm_on_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_name text;
  final_name text;
begin
  if coalesce(new.raw_user_meta_data->>'admin_created', '') = 'true' then
    return new;
  end if;

  if exists (select 1 from public.users u where u.id = new.id) then
    return new;
  end if;

  base_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'name'), ''),
    split_part(coalesce(new.email, ''), '@', 1),
    'staff'
  );
  final_name := base_name || ' · ' || left(replace(new.id::text, '-', ''), 8);

  insert into public.users (id, auth_user_id, email, name, role, is_active, approval_status)
  values (
    new.id,
    new.id,
    new.email,
    final_name,
    'staff',
    true,
    'pending'
  );

  return new;
exception
  when unique_violation then
    return new;
end;
$$;

drop trigger if exists crm_on_auth_user_created on auth.users;

create trigger crm_on_auth_user_created
  after insert on auth.users
  for each row
  execute procedure public.crm_on_auth_user_created();

-- 참고: DB 단에서 leads/contracts RLS로 미승인 차단을 넣으려면
-- auth.uid()에 대응하는 public.users 행의 approval_status = 'approved' 조건을 사용하세요.
-- (현재 앱은 클라이언트에서 프로필 로드 시 차단합니다.)
