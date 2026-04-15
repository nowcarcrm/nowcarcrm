-- 상담결과 레거시 값 정규화: 사이드바 계약 단계와 동일하게 "계약완료"로 통일

update public.leads
set status = '계약완료'
where trim(coalesce(status, '')) in ('확정 출고', '확정출고', '확정', '출고');

update public.lead_status_history
set to_value = '계약완료'
where trim(coalesce(to_value, '')) in ('확정 출고', '확정출고', '확정', '출고');

update public.lead_status_history
set from_value = '계약완료'
where trim(coalesce(from_value, '')) in ('확정 출고', '확정출고', '확정', '출고');
