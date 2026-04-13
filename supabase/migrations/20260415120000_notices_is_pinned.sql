-- 공지 UI payload: is_pinned (스키마에 is_important만 있고 is_pinned 가 없는 DB 대비)
alter table public.notices
  add column if not exists is_pinned boolean not null default false;

comment on column public.notices.is_pinned is '목록 상단 고정';
