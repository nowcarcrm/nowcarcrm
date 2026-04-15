create table if not exists public.ai_employee_learnings (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.users(id) on delete cascade,
  learning_type varchar(50) not null check (
    learning_type in ('preferred_style', 'successful_ment', 'rejected_ment', 'feedback', 'consultation_pattern')
  ),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_learnings_employee
  on public.ai_employee_learnings (employee_id);

create index if not exists idx_ai_learnings_employee_type_created
  on public.ai_employee_learnings (employee_id, learning_type, created_at desc);
