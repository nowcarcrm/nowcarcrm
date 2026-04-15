create table if not exists public.ai_action_logs (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.users(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  actions jsonb not null,
  results jsonb not null,
  success boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_action_logs_employee_created
  on public.ai_action_logs (employee_id, created_at desc);

create index if not exists idx_ai_action_logs_lead_created
  on public.ai_action_logs (lead_id, created_at desc);
