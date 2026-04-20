-- leads: 연간 주행거리 (NULL = 미선택, 기존 행 영향 없음)
alter table public.leads add column if not exists annual_mileage varchar(20) null;
