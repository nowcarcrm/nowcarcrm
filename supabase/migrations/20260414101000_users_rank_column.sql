alter table public.users
add column if not exists rank text;

update public.users
set rank = '총괄대표'
where lower(coalesce(email, '')) = 'jyy1964@naver.com';

alter table public.users
drop constraint if exists users_rank_check;

alter table public.users
add constraint users_rank_check
check (
  rank is null
  or rank in ('주임', '대리', '과장', '차장', '팀장', '본부장', '대표', '총괄대표')
);
