-- Supabase SQL Editor 등에서 수동 적용용 (idempotent)
alter table public.notices
  add column if not exists is_pinned boolean not null default false;

comment on column public.notices.is_pinned is '목록 상단 고정';
