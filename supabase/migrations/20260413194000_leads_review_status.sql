alter table public.leads
add column if not exists review_status text;

update public.leads
set review_status = coalesce(nullif(trim(review_status), ''), '심사 전')
where review_status is null
   or trim(review_status) = '';

alter table public.leads
alter column review_status set default '심사 전';
