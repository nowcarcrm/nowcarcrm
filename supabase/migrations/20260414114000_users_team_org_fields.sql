alter table public.users
add column if not exists team_name text;

alter table public.users
add column if not exists division_name text default '1본부';

alter table public.users
drop constraint if exists users_team_name_check;

alter table public.users
add constraint users_team_name_check
check (
  team_name is null
  or team_name in ('1팀', '2팀')
);
