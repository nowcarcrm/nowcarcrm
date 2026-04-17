alter table public.users
  add column if not exists remaining_annual_leave numeric(4,1) not null default 12.0;

alter table public.leave_requests
  add column if not exists requested_by uuid null references public.users(id) on delete set null;

alter table public.leave_requests
  drop constraint if exists leave_requests_status_check;

alter table public.leave_requests
  add constraint leave_requests_status_check
  check (status in ('pending', 'approved', 'rejected', 'cancelled'));

update public.users set remaining_annual_leave = 10.0 where name = '조건희';
update public.users set remaining_annual_leave = 4.5 where name = '이종주';
update public.users set remaining_annual_leave = 12.0 where name = '이지훈';
update public.users set remaining_annual_leave = 7.5 where name = '어용선';
update public.users set remaining_annual_leave = 8.0 where name = '김대건';
update public.users set remaining_annual_leave = 8.0 where name = '박치언';
update public.users set remaining_annual_leave = 6.0 where name = '김선호';
update public.users set remaining_annual_leave = 8.5 where name = '장정환';
update public.users set remaining_annual_leave = 8.0 where name = '박준';
update public.users set remaining_annual_leave = 8.0 where name = '이창원';
update public.users set remaining_annual_leave = 9.5 where name = '김태환';
update public.users set remaining_annual_leave = 8.0 where name = '국인웅';
