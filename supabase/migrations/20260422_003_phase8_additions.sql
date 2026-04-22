-- Phase 8: MonthlyReport에 prepayment_amount 컬럼 추가
ALTER TABLE public.settlement_monthly_reports
  ADD COLUMN IF NOT EXISTS prepayment_amount BIGINT DEFAULT 0;

COMMENT ON COLUMN public.settlement_monthly_reports.prepayment_amount IS '선지급 차감액 (Phase 8)';
