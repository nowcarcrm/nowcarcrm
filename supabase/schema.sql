-- Run in Supabase SQL editor

create extension if not exists "pgcrypto";

-- ==========================================================
-- Core tables
-- ==========================================================

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  name text not null unique,
  email text unique,
  role text not null default 'staff' check (role in ('admin', 'manager', 'staff')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  car_model text not null,
  source text not null,
  status text not null,
  sensitivity text not null check (sensitivity in ('상', '중', '하')),
  manager text not null,
  manager_user_id uuid null references public.users(id) on delete set null,
  next_contact_at timestamptz null,
  created_at timestamptz not null default now()
);

-- ==========================================================
-- 상담기록 (consultations)
-- ==========================================================

create table if not exists public.consultations (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  counselor text null,
  method text null,
  importance text null,
  reaction text null,
  desired_progress_at timestamptz null,
  next_action_at timestamptz null,
  next_contact_memo text null,
  memo text not null,
  created_at timestamptz not null default now()
);

alter table public.consultations add column if not exists counselor text null;
alter table public.consultations add column if not exists method text null;
alter table public.consultations add column if not exists importance text null;
alter table public.consultations add column if not exists reaction text null;
alter table public.consultations add column if not exists desired_progress_at timestamptz null;
alter table public.consultations add column if not exists next_action_at timestamptz null;
alter table public.consultations add column if not exists next_contact_memo text null;

-- ==========================================================
-- 계약 고객 (contracts)
-- ==========================================================

create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  product text null,
  vehicle_name text null,
  monthly_payment numeric null,
  contract_term text null,
  deposit_or_prepayment text null,
  customer_support_amount numeric null,
  supplies_support_content text null,
  supplies_support_amount numeric null,
  total_support_cost numeric null,
  note text null,
  fee numeric null,
  profit_memo text null,
  status text null,
  dealer text null,
  finance_company text null,
  contract_date date null,
  customer_commitment_date date null,
  delivery_date date null
);

alter table public.contracts add column if not exists product text null;
alter table public.contracts add column if not exists vehicle_name text null;
alter table public.contracts add column if not exists monthly_payment numeric null;
alter table public.contracts add column if not exists contract_term text null;
alter table public.contracts add column if not exists deposit_or_prepayment text null;
alter table public.contracts add column if not exists customer_support_amount numeric null;
alter table public.contracts add column if not exists supplies_support_content text null;
alter table public.contracts add column if not exists supplies_support_amount numeric null;
alter table public.contracts add column if not exists total_support_cost numeric null;
alter table public.contracts add column if not exists note text null;
alter table public.contracts add column if not exists fee numeric null;
alter table public.contracts add column if not exists profit_memo text null;
alter table public.contracts add column if not exists status text null;
alter table public.contracts add column if not exists dealer text null;
alter table public.contracts add column if not exists finance_company text null;
alter table public.contracts add column if not exists contract_date date null;
alter table public.contracts add column if not exists customer_commitment_date date null;
alter table public.contracts add column if not exists delivery_date date null;

-- ==========================================================
-- 출고 진행 (export_progress)
-- canonical column: stage
-- legacy alias: status -> stage
-- ==========================================================

create table if not exists public.export_progress (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  stage text not null,
  order_date date null,
  vehicle_model text null,
  trim text null,
  options text null,
  color text null,
  dealer_name text null,
  dealer_staff_name text null,
  finance_company text null,
  vehicle_contract_number text null,
  customer_commitment_date date null,
  expected_delivery_date date null,
  actual_delivery_date date null,
  special_note text null,
  order_requested_at timestamptz null,
  order_completed_at timestamptz null,
  e_contract_started_at timestamptz null,
  e_contract_completed_at timestamptz null,
  delivery_coordinated_at timestamptz null,
  delivered_at timestamptz null,
  transport_company_received_at timestamptz null
);

-- Legacy normalize: if old schema has `status`, rename/copy to `stage`
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'export_progress' and column_name = 'status'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'export_progress' and column_name = 'stage'
  ) then
    alter table public.export_progress rename column status to stage;
  end if;
end $$;

alter table public.export_progress add column if not exists stage text;
alter table public.export_progress add column if not exists order_date date null;
alter table public.export_progress add column if not exists vehicle_model text null;
alter table public.export_progress add column if not exists trim text null;
alter table public.export_progress add column if not exists options text null;
alter table public.export_progress add column if not exists color text null;
alter table public.export_progress add column if not exists dealer_name text null;
alter table public.export_progress add column if not exists dealer_staff_name text null;
alter table public.export_progress add column if not exists finance_company text null;
alter table public.export_progress add column if not exists vehicle_contract_number text null;
alter table public.export_progress add column if not exists customer_commitment_date date null;
alter table public.export_progress add column if not exists expected_delivery_date date null;
alter table public.export_progress add column if not exists actual_delivery_date date null;
alter table public.export_progress add column if not exists special_note text null;
alter table public.export_progress add column if not exists order_requested_at timestamptz null;
alter table public.export_progress add column if not exists order_completed_at timestamptz null;
alter table public.export_progress add column if not exists e_contract_started_at timestamptz null;
alter table public.export_progress add column if not exists e_contract_completed_at timestamptz null;
alter table public.export_progress add column if not exists delivery_coordinated_at timestamptz null;
alter table public.export_progress add column if not exists delivered_at timestamptz null;
alter table public.export_progress add column if not exists transport_company_received_at timestamptz null;

update public.export_progress
set stage = coalesce(stage, '계약완료')
where stage is null;

alter table public.export_progress alter column stage set not null;
alter table public.export_progress drop column if exists status;

-- ==========================================================
-- 상태 이력 (lead_status_history)
-- canonical columns: status_type, from_value, to_value
-- legacy aliases: from_status/to_status
-- ==========================================================

create table if not exists public.lead_status_history (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  changed_by text not null,
  status_type text not null check (status_type in ('counseling_status', 'export_stage')),
  from_value text null,
  to_value text not null,
  changed_at timestamptz not null default now()
);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'lead_status_history' and column_name = 'from_status'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'lead_status_history' and column_name = 'from_value'
  ) then
    alter table public.lead_status_history rename column from_status to from_value;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'lead_status_history' and column_name = 'to_status'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'lead_status_history' and column_name = 'to_value'
  ) then
    alter table public.lead_status_history rename column to_status to to_value;
  end if;
end $$;

alter table public.lead_status_history add column if not exists changed_by text null;
alter table public.lead_status_history add column if not exists status_type text null;
alter table public.lead_status_history add column if not exists from_value text null;
alter table public.lead_status_history add column if not exists to_value text null;
alter table public.lead_status_history add column if not exists changed_at timestamptz not null default now();

update public.lead_status_history
set changed_by = coalesce(changed_by, 'system'),
    status_type = coalesce(status_type, 'counseling_status'),
    to_value = coalesce(to_value, '')
where changed_by is null or status_type is null or to_value is null;

alter table public.lead_status_history alter column changed_by set not null;
alter table public.lead_status_history alter column status_type set not null;
alter table public.lead_status_history alter column to_value set not null;
alter table public.lead_status_history drop constraint if exists lead_status_history_status_type_check;
alter table public.lead_status_history
  add constraint lead_status_history_status_type_check
  check (status_type in ('counseling_status', 'export_stage'));

alter table public.lead_status_history drop column if exists from_status;
alter table public.lead_status_history drop column if exists to_status;

-- ==========================================================
-- Attendance / holiday / CRM activity
-- ==========================================================

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  date date not null,
  check_in timestamptz null,
  check_out timestamptz null,
  status text not null check (status in ('정상 출근', '지각', '외근', '휴가', '결근', '조기 퇴근', '휴무', '휴무일 근무')),
  latitude numeric null,
  longitude numeric null,
  external_reason text null,
  memo text null,
  is_holiday boolean not null default false,
  is_weekend boolean not null default false,
  holiday_work_approved boolean not null default false,
  checkin_status text null,
  checkout_status text null,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create table if not exists public.holidays (
  date date primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.crm_activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  date date not null,
  activity_type text not null check (activity_type in ('consultation_created', 'lead_created', 'status_changed', 'contract_progress')),
  lead_id uuid null references public.leads(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ==========================================================
-- Indexes
-- ==========================================================

create index if not exists idx_leads_manager on public.leads(manager);
create index if not exists idx_leads_manager_user_id on public.leads(manager_user_id);
create index if not exists idx_leads_status on public.leads(status);
create index if not exists idx_leads_next_contact_at on public.leads(next_contact_at);
create index if not exists idx_consultations_lead_id on public.consultations(lead_id);
create index if not exists idx_contracts_lead_id on public.contracts(lead_id);
create index if not exists idx_export_progress_lead_id on public.export_progress(lead_id);
create index if not exists idx_lead_status_history_lead_id on public.lead_status_history(lead_id, changed_at desc);
create index if not exists idx_attendance_user_date on public.attendance(user_id, date);
create index if not exists idx_holidays_date on public.holidays(date);
create index if not exists idx_activity_user_date on public.crm_activity_logs(user_id, date);
-- Run in Supabase SQL editor

create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  name text not null unique,
  email text unique,
  role text not null default 'staff' check (role in ('admin', 'manager', 'staff')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  car_model text not null,
  source text not null,
  status text not null,
  sensitivity text not null check (sensitivity in ('상', '중', '하')),
  manager text not null,
  manager_user_id uuid null references public.users(id) on delete set null,
  next_contact_at timestamptz null,
  created_at timestamptz not null default now()
);

create table if not exists public.consultations (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  counselor text null,
  method text null,
  importance text null,
  reaction text null,
  desired_progress_at timestamptz null,
  next_action_at timestamptz null,
  next_contact_memo text null,
  memo text not null,
  created_at timestamptz not null default now()
);

alter table public.consultations add column if not exists counselor text null;
alter table public.consultations add column if not exists method text null;
alter table public.consultations add column if not exists importance text null;
alter table public.consultations add column if not exists reaction text null;
alter table public.consultations add column if not exists desired_progress_at timestamptz null;
alter table public.consultations add column if not exists next_action_at timestamptz null;
alter table public.consultations add column if not exists next_contact_memo text null;

create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  product text null,
  vehicle_name text null,
  monthly_payment numeric null,
  contract_term text null,
  deposit_or_prepayment text null,
  customer_support_amount numeric null,
  supplies_support_content text null,
  supplies_support_amount numeric null,
  total_support_cost numeric null,
  note text null,
  fee numeric null,
  profit_memo text null,
  status text null,
  dealer text null,
  finance_company text null,
  contract_date date null,
  customer_commitment_date date null,
  delivery_date date null
);

alter table public.contracts add column if not exists product text null;
alter table public.contracts add column if not exists vehicle_name text null;
alter table public.contracts add column if not exists monthly_payment numeric null;
alter table public.contracts add column if not exists contract_term text null;
alter table public.contracts add column if not exists deposit_or_prepayment text null;
alter table public.contracts add column if not exists customer_support_amount numeric null;
alter table public.contracts add column if not exists supplies_support_content text null;
alter table public.contracts add column if not exists supplies_support_amount numeric null;
alter table public.contracts add column if not exists total_support_cost numeric null;
alter table public.contracts add column if not exists note text null;
alter table public.contracts add column if not exists profit_memo text null;
alter table public.contracts add column if not exists customer_commitment_date date null;

alter table public.contracts add column if not exists final_vehicle_price numeric null;
alter table public.contracts add column if not exists final_deposit_amount numeric null;
alter table public.contracts add column if not exists final_fee_amount numeric null;
alter table public.contracts add column if not exists final_delivery_type text null;

create table if not exists public.export_progress (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  stage text not null,
  order_date date null,
  vehicle_model text null,
  trim text null,
  options text null,
  color text null,
  dealer_name text null,
  dealer_staff_name text null,
  finance_company text null,
  vehicle_contract_number text null,
  customer_commitment_date date null,
  expected_delivery_date date null,
  actual_delivery_date date null,
  special_note text null,
  order_requested_at timestamptz null,
  order_completed_at timestamptz null,
  e_contract_started_at timestamptz null,
  e_contract_completed_at timestamptz null,
  delivery_coordinated_at timestamptz null,
  delivered_at timestamptz null,
  transport_company_received_at timestamptz null
);

alter table public.export_progress add column if not exists stage text;
alter table public.export_progress add column if not exists order_date date null;
alter table public.export_progress add column if not exists vehicle_model text null;
alter table public.export_progress add column if not exists trim text null;
alter table public.export_progress add column if not exists options text null;
alter table public.export_progress add column if not exists color text null;
alter table public.export_progress add column if not exists dealer_name text null;
alter table public.export_progress add column if not exists dealer_staff_name text null;
alter table public.export_progress add column if not exists finance_company text null;
alter table public.export_progress add column if not exists vehicle_contract_number text null;
alter table public.export_progress add column if not exists customer_commitment_date date null;
alter table public.export_progress add column if not exists expected_delivery_date date null;
alter table public.export_progress add column if not exists actual_delivery_date date null;
alter table public.export_progress add column if not exists special_note text null;
alter table public.export_progress add column if not exists order_requested_at timestamptz null;
alter table public.export_progress add column if not exists order_completed_at timestamptz null;
alter table public.export_progress add column if not exists e_contract_started_at timestamptz null;
alter table public.export_progress add column if not exists e_contract_completed_at timestamptz null;
alter table public.export_progress add column if not exists delivery_coordinated_at timestamptz null;
alter table public.export_progress add column if not exists delivered_at timestamptz null;
alter table public.export_progress add column if not exists transport_company_received_at timestamptz null;

-- Canonical columns for status history:
--   status_type, from_value, to_value
create table if not exists public.lead_status_history (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  changed_by text not null,
  status_type text not null check (status_type in ('counseling_status', 'export_stage')),
  from_value text null,
  to_value text not null,
  changed_at timestamptz not null default now()
);

-- Legacy migration (one-time):
-- If old schemas still have from_status/to_status, rename to canonical names.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'lead_status_history'
      and column_name = 'from_status'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'lead_status_history'
      and column_name = 'from_value'
  ) then
    alter table public.lead_status_history rename column from_status to from_value;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'lead_status_history'
      and column_name = 'to_status'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'lead_status_history'
      and column_name = 'to_value'
  ) then
    alter table public.lead_status_history rename column to_status to to_value;
  end if;
end $$;

alter table public.lead_status_history add column if not exists changed_by text null;
alter table public.lead_status_history add column if not exists status_type text null;
alter table public.lead_status_history add column if not exists from_value text null;
alter table public.lead_status_history add column if not exists to_value text null;
alter table public.lead_status_history add column if not exists changed_at timestamptz not null default now();

-- Finalize migration:
-- Drop legacy aliases so only canonical names remain.
alter table public.lead_status_history drop column if exists from_status;
alter table public.lead_status_history drop column if exists to_status;

-- Enforce the final canonical constraints.
update public.lead_status_history
set changed_by = coalesce(changed_by, 'system'),
    status_type = coalesce(status_type, 'counseling_status'),
    to_value = coalesce(to_value, '')
where changed_by is null or status_type is null or to_value is null;

alter table public.lead_status_history
  alter column changed_by set not null;
alter table public.lead_status_history
  alter column status_type set not null;
alter table public.lead_status_history
  alter column to_value set not null;

alter table public.lead_status_history drop constraint if exists lead_status_history_status_type_check;
alter table public.lead_status_history
  add constraint lead_status_history_status_type_check
  check (status_type in ('counseling_status', 'export_stage'));

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  date date not null,
  check_in timestamptz null,
  check_out timestamptz null,
  status text not null check (status in ('정상 출근', '지각', '외근', '휴가', '결근', '조기 퇴근', '휴무', '휴무일 근무')),
  latitude numeric null,
  longitude numeric null,
  external_reason text null,
  memo text null,
  is_holiday boolean not null default false,
  is_weekend boolean not null default false,
  holiday_work_approved boolean not null default false,
  checkin_status text null,
  checkout_status text null,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create table if not exists public.holidays (
  date date primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.crm_activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  date date not null,
  activity_type text not null check (activity_type in ('consultation_created', 'lead_created', 'status_changed', 'contract_progress')),
  lead_id uuid null references public.leads(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_leads_manager on public.leads(manager);
create index if not exists idx_leads_manager_user_id on public.leads(manager_user_id);
create index if not exists idx_leads_status on public.leads(status);
create index if not exists idx_leads_next_contact_at on public.leads(next_contact_at);
create index if not exists idx_consultations_lead_id on public.consultations(lead_id);
create index if not exists idx_contracts_lead_id on public.contracts(lead_id);
create index if not exists idx_export_progress_lead_id on public.export_progress(lead_id);
create index if not exists idx_lead_status_history_lead_id on public.lead_status_history(lead_id, changed_at desc);
create index if not exists idx_attendance_user_date on public.attendance(user_id, date);
create index if not exists idx_holidays_date on public.holidays(date);
create index if not exists idx_activity_user_date on public.crm_activity_logs(user_id, date);

-- ==========================================================
-- Detail Tabs Migration (consultation/contract/export/history)
-- Run this block when existing DB schema is out-of-sync.
-- ==========================================================

-- 1) 상담기록 테이블
create table if not exists public.consultations (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  counselor text null,
  method text null,
  importance text null,
  reaction text null,
  desired_progress_at timestamptz null,
  next_action_at timestamptz null,
  next_contact_memo text null,
  memo text not null,
  created_at timestamptz not null default now()
);

alter table public.consultations add column if not exists counselor text null;
alter table public.consultations add column if not exists method text null;
alter table public.consultations add column if not exists importance text null;
alter table public.consultations add column if not exists reaction text null;
alter table public.consultations add column if not exists desired_progress_at timestamptz null;
alter table public.consultations add column if not exists next_action_at timestamptz null;
alter table public.consultations add column if not exists next_contact_memo text null;
create index if not exists idx_consultations_lead_id on public.consultations(lead_id);

-- 2) 계약 고객 테이블
create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  product text null,
  vehicle_name text null,
  monthly_payment numeric null,
  contract_term text null,
  deposit_or_prepayment text null,
  customer_support_amount numeric null,
  supplies_support_content text null,
  supplies_support_amount numeric null,
  total_support_cost numeric null,
  note text null,
  fee numeric null,
  profit_memo text null,
  status text null,
  dealer text null,
  finance_company text null,
  contract_date date null,
  customer_commitment_date date null,
  delivery_date date null
);

alter table public.contracts add column if not exists product text null;
alter table public.contracts add column if not exists vehicle_name text null;
alter table public.contracts add column if not exists monthly_payment numeric null;
alter table public.contracts add column if not exists contract_term text null;
alter table public.contracts add column if not exists deposit_or_prepayment text null;
alter table public.contracts add column if not exists customer_support_amount numeric null;
alter table public.contracts add column if not exists supplies_support_content text null;
alter table public.contracts add column if not exists supplies_support_amount numeric null;
alter table public.contracts add column if not exists total_support_cost numeric null;
alter table public.contracts add column if not exists note text null;
alter table public.contracts add column if not exists fee numeric null;
alter table public.contracts add column if not exists profit_memo text null;
alter table public.contracts add column if not exists status text null;
alter table public.contracts add column if not exists dealer text null;
alter table public.contracts add column if not exists finance_company text null;
alter table public.contracts add column if not exists contract_date date null;
alter table public.contracts add column if not exists customer_commitment_date date null;
alter table public.contracts add column if not exists delivery_date date null;
create index if not exists idx_contracts_lead_id on public.contracts(lead_id);

-- 3) 출고 진행 테이블
create table if not exists public.export_progress (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  stage text not null,
  order_date date null,
  vehicle_model text null,
  trim text null,
  options text null,
  color text null,
  dealer_name text null,
  dealer_staff_name text null,
  finance_company text null,
  vehicle_contract_number text null,
  customer_commitment_date date null,
  expected_delivery_date date null,
  actual_delivery_date date null,
  special_note text null,
  order_requested_at timestamptz null,
  order_completed_at timestamptz null,
  e_contract_started_at timestamptz null,
  e_contract_completed_at timestamptz null,
  delivery_coordinated_at timestamptz null,
  delivered_at timestamptz null,
  transport_company_received_at timestamptz null
);

alter table public.export_progress add column if not exists stage text;
alter table public.export_progress add column if not exists order_date date null;
alter table public.export_progress add column if not exists vehicle_model text null;
alter table public.export_progress add column if not exists trim text null;
alter table public.export_progress add column if not exists options text null;
alter table public.export_progress add column if not exists color text null;
alter table public.export_progress add column if not exists dealer_name text null;
alter table public.export_progress add column if not exists dealer_staff_name text null;
alter table public.export_progress add column if not exists finance_company text null;
alter table public.export_progress add column if not exists vehicle_contract_number text null;
alter table public.export_progress add column if not exists customer_commitment_date date null;
alter table public.export_progress add column if not exists expected_delivery_date date null;
alter table public.export_progress add column if not exists actual_delivery_date date null;
alter table public.export_progress add column if not exists special_note text null;
alter table public.export_progress add column if not exists order_requested_at timestamptz null;
alter table public.export_progress add column if not exists order_completed_at timestamptz null;
alter table public.export_progress add column if not exists e_contract_started_at timestamptz null;
alter table public.export_progress add column if not exists e_contract_completed_at timestamptz null;
alter table public.export_progress add column if not exists delivery_coordinated_at timestamptz null;
alter table public.export_progress add column if not exists delivered_at timestamptz null;
alter table public.export_progress add column if not exists transport_company_received_at timestamptz null;
create index if not exists idx_export_progress_lead_id on public.export_progress(lead_id);

-- 4) 상태 이력 테이블
create table if not exists public.lead_status_history (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  changed_by text not null,
  status_type text not null check (status_type in ('counseling_status', 'export_stage')),
  from_value text null,
  to_value text not null,
  changed_at timestamptz not null default now()
);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'lead_status_history'
      and column_name = 'from_status'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'lead_status_history'
      and column_name = 'from_value'
  ) then
    alter table public.lead_status_history rename column from_status to from_value;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'lead_status_history'
      and column_name = 'to_status'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'lead_status_history'
      and column_name = 'to_value'
  ) then
    alter table public.lead_status_history rename column to_status to to_value;
  end if;
end $$;

alter table public.lead_status_history add column if not exists changed_by text null;
alter table public.lead_status_history add column if not exists status_type text null;
alter table public.lead_status_history add column if not exists from_value text null;
alter table public.lead_status_history add column if not exists to_value text null;
alter table public.lead_status_history add column if not exists changed_at timestamptz not null default now();

update public.lead_status_history
set changed_by = coalesce(changed_by, 'system'),
    status_type = coalesce(status_type, 'counseling_status'),
    to_value = coalesce(to_value, '')
where changed_by is null or status_type is null or to_value is null;

alter table public.lead_status_history
  alter column changed_by set not null;
alter table public.lead_status_history
  alter column status_type set not null;
alter table public.lead_status_history
  alter column to_value set not null;

alter table public.lead_status_history drop constraint if exists lead_status_history_status_type_check;
alter table public.lead_status_history
  add constraint lead_status_history_status_type_check
  check (status_type in ('counseling_status', 'export_stage'));

create index if not exists idx_lead_status_history_lead_id on public.lead_status_history(lead_id, changed_at desc);

