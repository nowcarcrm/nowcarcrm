-- leave_requests: field_work type + attendance manual change audit log

alter table public.leave_requests
  drop constraint if exists leave_requests_request_type_check;

alter table public.leave_requests
  add constraint leave_requests_request_type_check
  check (request_type in ('annual', 'half', 'sick', 'field_work'));

update public.leave_requests
set request_type = 'annual'
where request_type not in ('annual', 'half', 'sick', 'field_work');

-- attendance.id is bigint in this project; FK column must match.
create table if not exists public.attendance_status_changes (
  id uuid primary key default gen_random_uuid(),
  attendance_id bigint not null references public.attendance(id) on delete cascade,
  changed_by uuid not null references public.users(id) on delete restrict,
  previous_status text null,
  new_status text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_attendance_status_changes_attendance_id
  on public.attendance_status_changes(attendance_id);

create index if not exists idx_attendance_status_changes_created_at
  on public.attendance_status_changes(created_at desc);
