-- 템플릿 저장용 테이블 생성
-- Supabase 대시보드의 SQL Editor에서 실행하세요

CREATE TABLE IF NOT EXISTS public.order_templates (
    id BIGSERIAL PRIMARY KEY,
    
    -- 템플릿 기본 정보
    template_name VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- 생성자 정보 (향후 사용자 시스템과 연동 가능)
    created_by VARCHAR(100) DEFAULT 'anonymous',
    
    -- 매핑 데이터 (JSON 형태로 저장)
    order_field_mapping JSONB NOT NULL,
    supplier_field_mapping JSONB NOT NULL,
    
    -- 고정값 필드 (항상 같은 값을 사용하는 필드)
    fixed_fields JSONB DEFAULT '{}',
    
    -- 템플릿 활성화 상태
    is_active BOOLEAN DEFAULT true,
    
    -- 생성/수정 시간
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- 사용 통계
    usage_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMP WITH TIME ZONE
);

-- 템플릿명 유니크 인덱스 (활성화된 템플릿만)
CREATE UNIQUE INDEX IF NOT EXISTS idx_template_name_active 
ON public.order_templates (template_name) 
WHERE is_active = true;

-- 생성시간 인덱스
CREATE INDEX IF NOT EXISTS idx_templates_created_at 
ON public.order_templates (created_at DESC);

-- 사용 통계 인덱스
CREATE INDEX IF NOT EXISTS idx_templates_usage 
ON public.order_templates (usage_count DESC, last_used_at DESC);

-- RLS (Row Level Security) 활성화
ALTER TABLE public.order_templates ENABLE ROW LEVEL SECURITY;

-- 모든 사용자가 읽기 가능 (공개 템플릿)
CREATE POLICY IF NOT EXISTS "템플릿 조회 허용" ON public.order_templates
    FOR SELECT USING (true);

-- 모든 사용자가 생성 가능
CREATE POLICY IF NOT EXISTS "템플릿 생성 허용" ON public.order_templates
    FOR INSERT WITH CHECK (true);

-- 생성자만 수정 가능 (향후 사용자 시스템 연동시 created_by 기준으로 변경)
CREATE POLICY IF NOT EXISTS "템플릿 수정 허용" ON public.order_templates
    FOR UPDATE USING (true);

-- 생성자만 삭제 가능 (소프트 삭제: is_active를 false로 설정)
CREATE POLICY IF NOT EXISTS "템플릿 삭제 허용" ON public.order_templates
    FOR UPDATE USING (true);

-- 테스트 데이터 삽입
INSERT INTO public.order_templates (
    template_name,
    description,
    order_field_mapping,
    supplier_field_mapping,
    fixed_fields,
    created_by
) VALUES (
    '기본 발주서 템플릿',
    '가장 기본적인 발주서 템플릿입니다. 상품명, 수량, 단가, 금액 등의 필수 필드를 포함합니다.',
    '{"상품명": "product_name", "수량": "quantity", "단가": "unit_price", "금액": "total_price", "고객명": "customer_name"}',
    '{"상품명": "상품명", "수량": "수량", "단가": "단가", "금액": "금액", "고객명": "고객명"}',
    '{"발주일자": "2024-01-01", "공급업체": "기본 공급업체"}',
    'system'
) ON CONFLICT (template_name) WHERE is_active = true DO NOTHING;

-- 템플릿 사용 통계 업데이트 함수
CREATE OR REPLACE FUNCTION update_template_usage(template_id BIGINT)
RETURNS void AS $$
BEGIN
    UPDATE public.order_templates 
    SET 
        usage_count = usage_count + 1,
        last_used_at = NOW()
    WHERE id = template_id AND is_active = true;
END;
$$ LANGUAGE plpgsql;

-- 순서 보장을 위한 supplier_field_mapping_array 컬럼 추가 (JSONB 배열)
-- 기존 테이블에 컬럼을 추가하는 경우 사용
ALTER TABLE public.order_templates 
ADD COLUMN IF NOT EXISTS supplier_field_mapping_array JSONB DEFAULT NULL;

-- 컬럼에 대한 코멘트 추가
COMMENT ON COLUMN public.order_templates.supplier_field_mapping_array IS '발주서 필드 순서 보장을 위한 배열 (supplierField, orderField, order 포함)';

-- 기존 템플릿들의 호환성을 위해 NULL 허용하지만, 새 템플릿은 순서 배열 포함 권장 