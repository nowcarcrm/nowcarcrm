-- =============================================================================
-- leads.manager_user_id 백필 (manager 문자열 ↔ public.users.name)
-- Supabase SQL Editor 또는 psql에서 단계별 실행 권장.
--
-- 규칙
-- - 대상: manager_user_id IS NULL 인 행만 UPDATE
-- - 매칭: lower(trim(leads.manager)) = lower(trim(users.name))
-- - 동명이인(users 쪽 동일 정규화 이름이 2명 이상): 그 이름으로는 자동 백필 안 함(해당 리드는 스킵)
-- - 신규 저장은 앱에서 manager + manager_user_id 함께 기록 유지
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) 현재 상태 점검
-- ---------------------------------------------------------------------------

-- 1-1. manager_user_id 가 비어 있는 건수
select count(*)::bigint as leads_manager_user_id_null
from public.leads
where manager_user_id is null;

-- 1-2. leads.manager 분포 (상위)
select trim(manager) as manager_raw, count(*)::bigint as lead_cnt
from public.leads
group by 1
order by lead_cnt desc, manager_raw
limit 80;

-- 1-3. public.users 요약
select id, name, email, role, is_active, approval_status
from public.users
order by lower(trim(name)), id;

-- 1-4. users.name 정규화 기준 중복 (동명이인 → 이름-only 백필 시 제외 대상)
select
  lower(trim(name)) as name_norm,
  count(*)::int as user_cnt,
  array_agg(id order by id) as user_ids,
  array_agg(trim(name) order by id) as names_raw
from public.users
where trim(coalesce(name, '')) <> ''
group by 1
having count(*) > 1
order by user_cnt desc, name_norm;

-- ---------------------------------------------------------------------------
-- 2) 검증용 조회 — 리드 담당 문자열과 users 매칭 미리보기
-- ---------------------------------------------------------------------------

with lead_mgr as (
  select
    id as lead_id,
    trim(manager) as manager_trim,
    lower(trim(manager)) as manager_norm
  from public.leads
  where manager_user_id is null
    and trim(coalesce(manager, '')) <> ''
),
user_norm as (
  select
    id as user_id,
    trim(name) as name_trim,
    lower(trim(name)) as name_norm,
    role,
    coalesce(is_active, true) as is_active
  from public.users
  where trim(coalesce(name, '')) <> ''
),
match_counts as (
  select
    l.lead_id,
    l.manager_trim,
    count(u.user_id)::int as matching_user_cnt
  from lead_mgr l
  left join user_norm u on u.name_norm = l.manager_norm
  group by l.lead_id, l.manager_trim
)
select
  l.lead_id,
  l.manager_trim,
  m.matching_user_cnt,
  u.user_id,
  u.name_trim as matched_user_name,
  u.role
from lead_mgr l
join match_counts m on m.lead_id = l.lead_id
left join user_norm u on u.name_norm = l.manager_norm
where m.matching_user_cnt = 1
order by l.manager_trim, l.lead_id
limit 200;

-- matching_user_cnt > 1 인 리드(동명이인으로 자동 백필 불가) 목록
with lead_mgr as (
  select id as lead_id, trim(manager) as manager_trim, lower(trim(manager)) as manager_norm
  from public.leads
  where manager_user_id is null and trim(coalesce(manager, '')) <> ''
),
user_norm as (
  select id as user_id, lower(trim(name)) as name_norm from public.users
  where trim(coalesce(name, '')) <> ''
)
select
  l.lead_id,
  l.manager_trim,
  count(u.user_id)::int as matching_user_cnt,
  array_agg(u.user_id order by u.user_id) as candidate_user_ids
from lead_mgr l
join user_norm u on u.name_norm = l.manager_norm
group by l.lead_id, l.manager_trim
having count(u.user_id) > 1
order by matching_user_cnt desc, l.manager_trim;

-- 매칭 0건 (오타·미등록 직원명 등)
with lead_mgr as (
  select id as lead_id, trim(manager) as manager_trim, lower(trim(manager)) as manager_norm
  from public.leads
  where manager_user_id is null and trim(coalesce(manager, '')) <> ''
),
user_norm as (
  select id as user_id, lower(trim(name)) as name_norm from public.users
  where trim(coalesce(name, '')) <> ''
)
select
  l.lead_id,
  l.manager_trim
from lead_mgr l
left join user_norm u on u.name_norm = l.manager_norm
where u.user_id is null
order by l.manager_trim, l.lead_id
limit 500;

-- ---------------------------------------------------------------------------
-- 3) 1차 백필 UPDATE
--    (트랜잭션 안에서 실행·확인 후 COMMIT 권장)
-- ---------------------------------------------------------------------------

begin;

update public.leads l
set manager_user_id = u.id
from public.users u
where l.manager_user_id is null
  and trim(coalesce(l.manager, '')) <> ''
  and lower(trim(l.manager)) = lower(trim(u.name))
  and (
    select count(*)::int
    from public.users u2
    where trim(coalesce(u2.name, '')) <> ''
      and lower(trim(u2.name)) = lower(trim(l.manager))
  ) = 1;

-- 선택: 승인된 계정만 매칭에 쓰려면 위 UPDATE의 FROM 절을 아래처럼 바꾸는 식으로 조정
--   from public.users u
--   where ... and coalesce(u.approval_status, 'approved') = 'approved'
-- (환경에 approval_status 컬럼이 없으면 해당 조건은 제거)

-- 영향 행 수 확인 (클라이언트에 따라 메시지 확인)
-- select ... 

commit;
-- 문제 시: rollback;

-- ---------------------------------------------------------------------------
-- 4) 백필 후 검증
-- ---------------------------------------------------------------------------

select count(*)::bigint as still_null
from public.leads
where manager_user_id is null;

-- FK 깨짐 (있으면 안 됨)
select l.id as lead_id, l.manager_user_id
from public.leads l
left join public.users u on u.id = l.manager_user_id
where l.manager_user_id is not null
  and u.id is null;

-- 샘플: manager 문자열 vs 연결된 users.name
select
  l.id,
  trim(l.manager) as manager_on_lead,
  u.name as user_name,
  u.email,
  l.manager_user_id
from public.leads l
join public.users u on u.id = l.manager_user_id
order by l.created_at desc
limit 50;

-- ---------------------------------------------------------------------------
-- 5) 예외 처리 — 수동 정리용 목록
-- ---------------------------------------------------------------------------

-- 여전히 null 인 리드의 담당 문자열 DISTINCT (관리자 UI에서 재배정 또는 users.name 정리)
select distinct trim(manager) as manager_value_needs_manual, count(*)::bigint as lead_cnt
from public.leads
where manager_user_id is null
  and trim(coalesce(manager, '')) <> ''
group by 1
order by lead_cnt desc, manager_value_needs_manual;

-- ---------------------------------------------------------------------------
-- 6) 앱 검증 (수동)
-- - 직원 A: 본인 담당 리드만 목록/검색/상세
-- - 직원 B: 동일
-- - 관리자: 전체 조회 + 담당 재배정
-- =============================================================================
