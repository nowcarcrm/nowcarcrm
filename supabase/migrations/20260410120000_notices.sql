-- 회사 공지사항 (대시보드)
-- created_by → public.users.id (프로젝트에 맞게 FK 조정 가능)

create table if not exists public.notices (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  is_active boolean not null default true
);

create index if not exists notices_active_created_desc
  on public.notices (is_active, created_at desc);

comment on table public.notices is 'CRM 대시보드 회사 공지';

-- 선택: users(id) FK (users 테이블이 있을 때만 적용)
-- alter table public.notices
--   add constraint notices_created_by_fkey
--   foreign key (created_by) references public.users (id) on delete restrict;
