update public.attendance a
set
  status = '지각',
  checkin_status = '지각'
from public.users u
where
  a.user_id = u.id
  and (u.role is distinct from 'super_admin')
  and coalesce(a.work_date::text, a.date::text) = current_date::text
  and coalesce(a.check_in, a.check_in_at) is not null
  and coalesce(a.check_in, a.check_in_at) > (date_trunc('day', now()) + interval '9 hour 30 minute')
  and coalesce(a.status, '') in ('정상 출근', '지각');
