create table if not exists public.daily_ai_analyses (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.users(id) on delete cascade,
  lead_id text not null,
  analysis_date date not null,
  temperature text not null check (temperature in ('HOT', 'WARM', 'COLD', 'DEAD')),
  urgency text not null check (urgency in ('긴급', '보통', '여유')),
  priority_score integer not null check (priority_score >= 0 and priority_score <= 100),
  next_action text not null,
  pre_generated_ment jsonb null,
  created_at timestamptz not null default now(),
  unique (employee_id, lead_id, analysis_date)
);

create index if not exists idx_daily_ai_analyses_employee_date
  on public.daily_ai_analyses (employee_id, analysis_date, priority_score desc);

create index if not exists idx_daily_ai_analyses_lead_date
  on public.daily_ai_analyses (lead_id, analysis_date desc);
