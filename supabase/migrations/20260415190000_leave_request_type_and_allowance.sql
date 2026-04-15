alter table public.leave_requests
  add column if not exists request_type text not null default 'annual';

alter table public.leave_requests
  add column if not exists used_amount numeric(3,1) not null default 1.0;

alter table public.leave_requests
  drop constraint if exists leave_requests_request_type_check;

alter table public.leave_requests
  add constraint leave_requests_request_type_check
  check (request_type in ('annual', 'half', 'sick'));

alter table public.leave_requests
  drop constraint if exists leave_requests_used_amount_check;

alter table public.leave_requests
  add constraint leave_requests_used_amount_check
  check (used_amount in (0.0, 0.5, 1.0));

update public.leave_requests
set request_type = case
  when request_type in ('annual', 'half', 'sick') then request_type
  else 'annual'
end;

update public.leave_requests
set used_amount = case
  when request_type = 'sick' then 0.0
  when request_type = 'half' then 0.5
  else 1.0
end
where used_amount not in (0.0, 0.5, 1.0);
