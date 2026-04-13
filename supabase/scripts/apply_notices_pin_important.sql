-- 공지 저장 오류: "Could not find the 'is_important' column ... in the schema cache"
--
-- 1) 컬럼이 실제로 있는지 먼저 확인 (결과에 is_pinned, is_important 가 있어야 함)
-- 2) 없으면 아래 ALTER 실행
-- 3) 컬럼이 있는데도 같은 에러면 PostgREST 스키마 캐시 갱신: NOTIFY pgrst, 'reload schema';
--
-- 사용: Supabase Dashboard → SQL Editor
-- 프론트 payload: leaseCrmSupabase.ts → is_pinned, is_important (snake_case), public.notices

-- --- 확인용 (선택) ---
-- select column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'notices'
-- order by ordinal_position;

alter table public.notices add column if not exists is_pinned boolean not null default false;
alter table public.notices add column if not exists is_important boolean not null default false;

create index if not exists notices_pin_important_created
  on public.notices (is_pinned desc, is_important desc, created_at desc);

comment on column public.notices.is_pinned is '목록 상단 고정';
comment on column public.notices.is_important is '강조 배지(중요 공지)';

-- API( PostgREST )가 DB 변경을 아직 반영하지 않을 때 — 컬럼 추가 후에도 "schema cache" 오류가 나면 필수
notify pgrst, 'reload schema';
