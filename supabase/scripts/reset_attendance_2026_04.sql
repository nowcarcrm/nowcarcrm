-- ============================================================
-- 2026년 4월 근태 원천 데이터 삭제 → 월간 직원 근태 집계 0부터 재시작
-- 실행 전 백업 권장. Supabase SQL Editor에서 이 프로젝트에 연결된 DB에만 실행하세요.
-- (date 또는 work_date 중 하나라도 2026-04 범위에 있으면 삭제)
-- ============================================================

delete from public.attendance
where
  (date is not null and date >= date '2026-04-01' and date <= date '2026-04-30')
  or (work_date is not null and work_date >= date '2026-04-01' and work_date <= date '2026-04-30');

-- (선택) attendance_status_changes 테이블이 있고 4월 로그를 비우려면 주석 해제
-- delete from public.attendance_status_changes
-- where created_at >= timestamptz '2026-04-01 00:00:00+09'
--   and created_at < timestamptz '2026-05-01 00:00:00+09';
