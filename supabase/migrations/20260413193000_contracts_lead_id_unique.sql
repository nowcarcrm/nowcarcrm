-- contracts.lead_id 를 1:1로 강제하기 위한 정리/제약

-- 1) 동일 lead_id 중복 정리: 최신(updated_at/created_at/id) 1건만 유지
with ranked as (
  select
    ctid,
    row_number() over (
      partition by lead_id
      order by updated_at desc nulls last, created_at desc nulls last, id desc
    ) as rn
  from public.contracts
)
delete from public.contracts t
using ranked r
where t.ctid = r.ctid
  and r.rn > 1;

-- 2) lead_id unique 제약 추가
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'unique_lead_contract'
      and conrelid = 'public.contracts'::regclass
  ) then
    alter table public.contracts
      add constraint unique_lead_contract unique (lead_id);
  end if;
end $$;

