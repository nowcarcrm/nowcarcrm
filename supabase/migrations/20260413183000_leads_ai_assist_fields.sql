-- AI 상담 어시스트 결과 저장 컬럼
alter table public.leads
  add column if not exists summary_text text null;

alter table public.leads
  add column if not exists next_action text null;

alter table public.leads
  add column if not exists customer_intent text null
  check (customer_intent in ('exploring', 'interested', 'closing'));

create index if not exists idx_leads_customer_intent
  on public.leads (customer_intent);

