-- Phase 1: 정산 시스템 테이블 (10개) + 요율 템플릿 시드
-- 수동 실행 전용 — Supabase SQL Editor에서 실행
--
-- 참고: public.users.team_name 은 20260414114000_users_team_org_fields.sql 에서 이미 추가됨 → 이 파일에서는 ALTER 생략

-- ------------------------------------------------------------------
-- 1. settlement_rate_templates
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.settlement_rate_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  base_rate DECIMAL(5, 2) NOT NULL,
  eligible_incentive BOOLEAN NOT NULL DEFAULT false,
  incentive_per_tier_percent DECIMAL(5, 2) DEFAULT 5.00,
  include_sliding BOOLEAN NOT NULL DEFAULT false,
  is_excluded BOOLEAN NOT NULL DEFAULT false,
  special_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.users (id),
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_rate_templates_user ON public.settlement_rate_templates (user_id);

COMMENT ON TABLE public.settlement_rate_templates IS '직원별 기본 요율 템플릿 (매월 복제 원본)';

-- ------------------------------------------------------------------
-- 2. settlement_monthly_rates
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.settlement_monthly_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  rate_month VARCHAR(7) NOT NULL,
  base_rate DECIMAL(5, 2) NOT NULL,
  eligible_incentive BOOLEAN NOT NULL DEFAULT false,
  incentive_per_tier_percent DECIMAL(5, 2) DEFAULT 5.00,
  include_sliding BOOLEAN NOT NULL DEFAULT false,
  is_excluded BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.users (id),
  UNIQUE (user_id, rate_month)
);

CREATE INDEX IF NOT EXISTS idx_monthly_rates_month ON public.settlement_monthly_rates (rate_month);
CREATE INDEX IF NOT EXISTS idx_monthly_rates_user_month ON public.settlement_monthly_rates (user_id, rate_month);

COMMENT ON TABLE public.settlement_monthly_rates IS '월별 적용 요율 (템플릿에서 복제되며 월별 수정 가능)';

-- ------------------------------------------------------------------
-- 3. settlement_deliveries
--    lead_id: public.leads.id 는 bigint (기존 estimates 등과 동일)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.settlement_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.users (id),
  created_by UUID NOT NULL REFERENCES public.users (id),
  team_name VARCHAR(50),
  lead_id BIGINT REFERENCES public.leads (id) ON DELETE SET NULL,
  financial_company VARCHAR(100) NOT NULL,
  product_type VARCHAR(20) NOT NULL,
  contract_date DATE,
  delivery_date DATE NOT NULL,
  registration_date DATE,
  customer_name VARCHAR(100) NOT NULL,
  car_model VARCHAR(100) NOT NULL,
  car_price BIGINT NOT NULL,
  ag_commission BIGINT NOT NULL DEFAULT 0,
  dealer_commission BIGINT DEFAULT 0,
  etc_revenue BIGINT DEFAULT 0,
  customer_support BIGINT DEFAULT 0,
  delivery_type VARCHAR(20) NOT NULL,
  dealer_name VARCHAR(100),
  dealer_contract_no VARCHAR(100),
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  ag_settlement_month VARCHAR(7),
  dealer_settlement_month VARCHAR(7),
  notes TEXT,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_deliveries_owner ON public.settlement_deliveries (owner_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_team ON public.settlement_deliveries (team_name);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON public.settlement_deliveries (status);
CREATE INDEX IF NOT EXISTS idx_deliveries_ag_month ON public.settlement_deliveries (ag_settlement_month);
CREATE INDEX IF NOT EXISTS idx_deliveries_dealer_month ON public.settlement_deliveries (dealer_settlement_month);
CREATE INDEX IF NOT EXISTS idx_deliveries_delivery_date ON public.settlement_deliveries (delivery_date);

COMMENT ON TABLE public.settlement_deliveries IS '출고 건 메인 테이블';

-- ------------------------------------------------------------------
-- 4. settlement_approvals
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.settlement_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES public.settlement_deliveries (id) ON DELETE CASCADE,
  approver_id UUID NOT NULL REFERENCES public.users (id),
  approval_level VARCHAR(30) NOT NULL,
  action VARCHAR(20) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approvals_delivery ON public.settlement_approvals (delivery_id);
CREATE INDEX IF NOT EXISTS idx_approvals_approver ON public.settlement_approvals (approver_id);

COMMENT ON TABLE public.settlement_approvals IS '승인/반려/재오픈/확정/이월 이력';

-- ------------------------------------------------------------------
-- 5. settlement_prepayments
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.settlement_prepayments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_date DATE NOT NULL,
  source VARCHAR(100) NOT NULL,
  amount BIGINT NOT NULL,
  target_user_id UUID NOT NULL REFERENCES public.users (id),
  target_month VARCHAR(7) NOT NULL,
  delivery_id UUID REFERENCES public.settlement_deliveries (id),
  notes TEXT,
  applied BOOLEAN DEFAULT false,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES public.users (id)
);

CREATE INDEX IF NOT EXISTS idx_prepayments_target ON public.settlement_prepayments (target_user_id, target_month);
CREATE INDEX IF NOT EXISTS idx_prepayments_applied ON public.settlement_prepayments (applied);

COMMENT ON TABLE public.settlement_prepayments IS '선지급 예치금 메모 (다음 달 정산 시 반영)';

-- ------------------------------------------------------------------
-- 6. settlement_monthly_reports
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.settlement_monthly_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users (id),
  rate_month VARCHAR(7) NOT NULL,
  total_ag_commission BIGINT DEFAULT 0,
  total_dealer_commission BIGINT DEFAULT 0,
  total_etc_revenue BIGINT DEFAULT 0,
  total_revenue BIGINT DEFAULT 0,
  total_customer_support BIGINT DEFAULT 0,
  net_revenue BIGINT DEFAULT 0,
  base_rate DECIMAL(5, 2),
  eligible_incentive BOOLEAN,
  incentive_tier INT DEFAULT 0,
  incentive_rate DECIMAL(5, 2) DEFAULT 0,
  rate_based_amount BIGINT DEFAULT 0,
  support_50_amount BIGINT DEFAULT 0,
  adjustment_amount BIGINT DEFAULT 0,
  adjustment_notes TEXT,
  prepayment_amount BIGINT DEFAULT 0,
  final_amount BIGINT DEFAULT 0,
  status VARCHAR(30) DEFAULT 'draft',
  confirmed_at TIMESTAMPTZ,
  confirmed_by UUID REFERENCES public.users (id),
  paid_at TIMESTAMPTZ,
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, rate_month)
);

CREATE INDEX IF NOT EXISTS idx_reports_month ON public.settlement_monthly_reports (rate_month);
CREATE INDEX IF NOT EXISTS idx_reports_status ON public.settlement_monthly_reports (status);

COMMENT ON TABLE public.settlement_monthly_reports IS '월별 직원 정산 결과';

-- ------------------------------------------------------------------
-- 7. settlement_adjustments
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.settlement_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.settlement_monthly_reports (id) ON DELETE CASCADE,
  amount BIGINT NOT NULL,
  reason TEXT NOT NULL,
  related_month VARCHAR(7),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES public.users (id)
);

CREATE INDEX IF NOT EXISTS idx_adjustments_report ON public.settlement_adjustments (report_id);

COMMENT ON TABLE public.settlement_adjustments IS '정산 조정 항목 (다음 달 반영용)';

-- ------------------------------------------------------------------
-- 8. settlement_disputes
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.settlement_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.settlement_monthly_reports (id) ON DELETE CASCADE,
  submitted_by UUID NOT NULL REFERENCES public.users (id),
  content TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  response TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.users (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_disputes_report ON public.settlement_disputes (report_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON public.settlement_disputes (status);

COMMENT ON TABLE public.settlement_disputes IS '정산 이의 제기';

-- ------------------------------------------------------------------
-- 9. settlement_dealer_uploads
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.settlement_dealer_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_url TEXT NOT NULL,
  file_name VARCHAR(200),
  file_type VARCHAR(20),
  source VARCHAR(100),
  settlement_month VARCHAR(7),
  uploaded_by UUID NOT NULL REFERENCES public.users (id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ai_parsed_data JSONB,
  matched_count INT DEFAULT 0,
  unmatched_count INT DEFAULT 0,
  status VARCHAR(20) DEFAULT 'pending',
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_dealer_uploads_status ON public.settlement_dealer_uploads (status);
CREATE INDEX IF NOT EXISTS idx_dealer_uploads_month ON public.settlement_dealer_uploads (settlement_month);

COMMENT ON TABLE public.settlement_dealer_uploads IS '대리점 수당 파일 업로드 + AI 파싱 로그';

-- ------------------------------------------------------------------
-- 10. settlement_audit_logs
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.settlement_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50),
  entity_id UUID,
  target_user_id UUID REFERENCES public.users (id),
  performed_by UUID NOT NULL REFERENCES public.users (id),
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_action ON public.settlement_audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON public.settlement_audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_performer ON public.settlement_audit_logs (performed_by);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.settlement_audit_logs (created_at DESC);

COMMENT ON TABLE public.settlement_audit_logs IS '모든 정산 관련 변경 이력 (본부장+ 열람)';

-- ------------------------------------------------------------------
-- 초기 데이터: 요율 템플릿 (이름 기준; 사용자 없으면 0행 삽입)
-- ------------------------------------------------------------------
INSERT INTO public.settlement_rate_templates (user_id, base_rate, eligible_incentive, include_sliding, is_excluded, special_note)
SELECT id, 60.00, false, false, false, NULL FROM public.users WHERE name = '이호성'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.settlement_rate_templates (user_id, base_rate, eligible_incentive, include_sliding, is_excluded, special_note)
SELECT id, 50.00, false, true, false, NULL FROM public.users WHERE name = '조건희'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.settlement_rate_templates (user_id, base_rate, eligible_incentive, include_sliding, is_excluded, special_note)
SELECT id, 50.00, false, true, false, NULL FROM public.users WHERE name = '이종주'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.settlement_rate_templates (user_id, base_rate, eligible_incentive, include_sliding, is_excluded, special_note)
SELECT id, 50.00, false, false, false, NULL FROM public.users WHERE name = '이지훈'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.settlement_rate_templates (user_id, base_rate, eligible_incentive, include_sliding, is_excluded, special_note)
SELECT id, 40.00, true, false, false, NULL FROM public.users WHERE name = '김대건'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.settlement_rate_templates (user_id, base_rate, eligible_incentive, include_sliding, is_excluded, special_note)
SELECT id, 40.00, true, false, false, NULL FROM public.users WHERE name = '박치언'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.settlement_rate_templates (user_id, base_rate, eligible_incentive, include_sliding, is_excluded, special_note)
SELECT id, 40.00, true, false, false, NULL FROM public.users WHERE name = '어용선'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.settlement_rate_templates (user_id, base_rate, eligible_incentive, include_sliding, is_excluded, special_note)
SELECT id, 50.00, false, true, false, NULL FROM public.users WHERE name = '김선호'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.settlement_rate_templates (user_id, base_rate, eligible_incentive, include_sliding, is_excluded, special_note)
SELECT id, 50.00, false, false, false, NULL FROM public.users WHERE name = '이창원'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.settlement_rate_templates (user_id, base_rate, eligible_incentive, include_sliding, is_excluded, special_note)
SELECT id, 50.00, false, true, false, NULL FROM public.users WHERE name = '장정환'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.settlement_rate_templates (user_id, base_rate, eligible_incentive, include_sliding, is_excluded, special_note)
SELECT id, 40.00, true, false, false, NULL FROM public.users WHERE name = '박준'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.settlement_rate_templates (user_id, base_rate, eligible_incentive, include_sliding, is_excluded, special_note)
SELECT id, 40.00, true, false, false, NULL FROM public.users WHERE name = '국인웅'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.settlement_rate_templates (user_id, base_rate, eligible_incentive, include_sliding, is_excluded, special_note)
SELECT id, 45.00, false, false, false, '특수 요율: 다른 대리와 조건 다름 (45% + 인센티브 제외 + 슬라이딩 제외)'
FROM public.users WHERE name = '김태환'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.settlement_rate_templates (user_id, base_rate, eligible_incentive, include_sliding, is_excluded, special_note)
SELECT id, 0.00, false, false, true, '정산 시스템 제외 (참고만, 본인 출고건 별도 아날로그 처리)'
FROM public.users WHERE name = '이준영'
ON CONFLICT (user_id) DO NOTHING;

-- 팀 소속 (users.team_name CHECK: 1팀, 2팀, NULL)
UPDATE public.users SET team_name = '1팀' WHERE name IN ('조건희', '이종주', '이지훈', '김대건', '박치언', '어용선');
UPDATE public.users SET team_name = '2팀' WHERE name IN ('김선호', '이창원', '장정환', '박준', '국인웅', '김태환');
UPDATE public.users SET team_name = NULL WHERE name = '이호성';
