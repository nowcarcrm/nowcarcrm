-- 모딜카 엑셀 컬럼 매핑 설정 (재사용 목적)
CREATE TABLE IF NOT EXISTS public.settlement_modilca_column_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL DEFAULT 'default',
  mapping_json JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES public.users(id),
  UNIQUE(name)
);

COMMENT ON TABLE public.settlement_modilca_column_mappings IS '모딜카 엑셀 컬럼 매핑 저장 (매번 수동 매핑 방지)';

-- 모딜카 업로드 이력
CREATE TABLE IF NOT EXISTS public.settlement_modilca_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name VARCHAR(200),
  uploaded_by UUID NOT NULL REFERENCES public.users(id),
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  parsed_rows JSONB,
  matched_count INT DEFAULT 0,
  unmatched_count INT DEFAULT 0,
  status VARCHAR(20) DEFAULT 'pending',
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_modilca_uploads_by ON public.settlement_modilca_uploads(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_modilca_uploads_status ON public.settlement_modilca_uploads(status);

COMMENT ON TABLE public.settlement_modilca_uploads IS '모딜카 엑셀 업로드 이력';
