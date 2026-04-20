-- 섹션 A: 로그인 이력, 권한 마스터, 권한 변경·열람·보내기 로그
-- Supabase SQL Editor에서 실행하거나 supabase migration으로 적용하세요.

-- ------------------------------------------------------------------
-- 1) 로그인 이력
-- ------------------------------------------------------------------
create table if not exists public.login_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references public.users (id) on delete set null,
  attempted_email text null,
  login_at timestamptz not null default now(),
  ip_address varchar(128) null,
  user_agent text null,
  device_info varchar(32) null,
  login_status varchar(16) not null check (login_status in ('success', 'failed')),
  failure_reason text null,
  foreign_ip_warning boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_login_logs_user_id on public.login_logs (user_id);
create index if not exists idx_login_logs_login_at on public.login_logs (login_at desc);

alter table public.login_logs enable row level security;

-- 연속 실패 잠금 (이메일 기준)
create table if not exists public.email_login_guard (
  email_normalized text primary key,
  consecutive_failures int not null default 0,
  locked_until timestamptz null,
  updated_at timestamptz not null default now()
);

alter table public.email_login_guard enable row level security;

-- ------------------------------------------------------------------
-- 2) 권한 마스터 + 변경 이력
-- ------------------------------------------------------------------
create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  role varchar(32) not null,
  resource varchar(64) not null,
  can_read boolean not null default false,
  can_create boolean not null default false,
  can_update boolean not null default false,
  can_delete boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (role, resource)
);

create index if not exists idx_permissions_role on public.permissions (role);

create table if not exists public.permission_change_logs (
  id uuid primary key default gen_random_uuid(),
  changed_by uuid null references public.users (id) on delete set null,
  role varchar(32) not null,
  resource varchar(64) not null,
  field varchar(24) not null,
  old_value boolean not null,
  new_value boolean not null,
  changed_at timestamptz not null default now()
);

create index if not exists idx_permission_change_logs_changed_at on public.permission_change_logs (changed_at desc);

alter table public.permissions enable row level security;
alter table public.permission_change_logs enable row level security;

-- ------------------------------------------------------------------
-- 3) 연락처 열람 로그
-- ------------------------------------------------------------------
create table if not exists public.access_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  accessed_resource varchar(64) not null,
  resource_id uuid not null,
  accessed_at timestamptz not null default now(),
  action_type varchar(64) not null,
  ip_address varchar(128) null
);

create index if not exists idx_access_logs_user_accessed on public.access_logs (user_id, accessed_at desc);
create index if not exists idx_access_logs_resource on public.access_logs (resource_id, accessed_at desc);

alter table public.access_logs enable row level security;

-- ------------------------------------------------------------------
-- 4) 보내기 로그
-- ------------------------------------------------------------------
create table if not exists public.export_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  export_type varchar(32) not null,
  exported_count int not null default 0,
  file_name varchar(512) null,
  exported_at timestamptz not null default now(),
  ip_address varchar(128) null
);

create index if not exists idx_export_logs_user_exported on public.export_logs (user_id, exported_at desc);
create index if not exists idx_export_logs_exported_at on public.export_logs (exported_at desc);

alter table public.export_logs enable row level security;

-- ------------------------------------------------------------------
-- 5) 기본 권한 시드 (role × resource)
-- 리소스: leads, consultations, announcements, attendance
-- ------------------------------------------------------------------
insert into public.permissions (role, resource, can_read, can_create, can_update, can_delete, updated_at)
values
  ('super_admin', 'leads', true, true, true, true, now()),
  ('super_admin', 'consultations', true, true, true, true, now()),
  ('super_admin', 'announcements', true, true, true, true, now()),
  ('super_admin', 'attendance', true, true, true, true, now()),
  ('ceo', 'leads', true, true, true, true, now()),
  ('ceo', 'consultations', true, true, true, true, now()),
  ('ceo', 'announcements', true, true, true, false, now()),
  ('ceo', 'attendance', true, true, true, true, now()),
  ('director', 'leads', true, true, true, true, now()),
  ('director', 'consultations', true, true, true, true, now()),
  ('director', 'announcements', true, false, false, false, now()),
  ('director', 'attendance', true, true, true, true, now()),
  ('team_leader', 'leads', true, true, true, false, now()),
  ('team_leader', 'consultations', true, true, true, true, now()),
  ('team_leader', 'announcements', true, false, false, false, now()),
  ('team_leader', 'attendance', true, true, true, false, now()),
  ('manager', 'leads', true, true, true, false, now()),
  ('manager', 'consultations', true, true, true, false, now()),
  ('manager', 'announcements', true, false, false, false, now()),
  ('manager', 'attendance', true, false, false, false, now()),
  ('staff', 'leads', true, true, true, false, now()),
  ('staff', 'consultations', true, true, true, false, now()),
  ('staff', 'announcements', true, false, false, false, now()),
  ('staff', 'attendance', true, false, false, false, now())
on conflict (role, resource) do update set
  can_read = excluded.can_read,
  can_create = excluded.can_create,
  can_update = excluded.can_update,
  can_delete = excluded.can_delete,
  updated_at = excluded.updated_at;
