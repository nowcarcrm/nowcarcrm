-- 계약 확정·출고 시 금액 스냅샷 (견적 변경과 무관한 실적·수수료 기준)

alter table public.contracts
  add column if not exists final_vehicle_price numeric null,
  add column if not exists final_deposit_amount numeric null,
  add column if not exists final_fee_amount numeric null,
  add column if not exists final_delivery_type text null;

comment on column public.contracts.final_vehicle_price is '확정·출고 시 차량가 스냅샷';
comment on column public.contracts.final_deposit_amount is '확정·출고 시 보증금 스냅샷';
comment on column public.contracts.final_fee_amount is '확정·출고 시 수수료 스냅샷';
comment on column public.contracts.final_delivery_type is '확정·출고 시 출고 유형 스냅샷';
