-- 직원 승인 시 감사 필드 (관리자 API에서 설정)
alter table public.users add column if not exists approved_at timestamptz;
alter table public.users add column if not exists approved_by uuid references public.users (id);

comment on column public.users.approved_at is 'approval_status가 approved로 바뀐 시각';
comment on column public.users.approved_by is '승인한 관리자 users.id';
