-- 공지: 상단 고정 · 중요 표시 (운영용)
alter table public.notices add column if not exists is_pinned boolean not null default false;
alter table public.notices add column if not exists is_important boolean not null default false;

create index if not exists notices_pin_important_created
  on public.notices (is_pinned desc, is_important desc, created_at desc);

comment on column public.notices.is_pinned is '목록 상단 고정';
comment on column public.notices.is_important is '강조 배지(중요 공지)';
