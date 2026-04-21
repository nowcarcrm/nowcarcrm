-- 조건희 팀장: 2026-04-21 반차(실수) 취소 + 잔여 연차 9회 + 해당일 근태 정상화
-- Supabase SQL Editor에서 실행하세요. (조건희 한 명만 갱신)
--
-- 스키마 참고: leave_requests.request_type = 'half' | 'annual' | ...
--            leave_requests.from_date / to_date (date)
--            users.remaining_annual_leave (numeric)
--            attendance.user_id, date, work_date, status, checkin_status

BEGIN;

-- 1) 해당일 반차(승인됨) 요청 취소
UPDATE public.leave_requests
SET status = 'cancelled'
WHERE user_id = (SELECT id FROM public.users WHERE name = '조건희' LIMIT 1)
  AND request_type = 'half'
  AND status = 'approved'
  AND from_date <= DATE '2026-04-21'
  AND to_date >= DATE '2026-04-21';

-- 2) 잔여 연차 9회로 복구 (요청값 그대로)
UPDATE public.users
SET remaining_annual_leave = 9
WHERE name = '조건희';

-- 3) 오늘 근태에서 반차 표시 제거 → 정상 출근
UPDATE public.attendance
SET
  status = '정상 출근',
  checkin_status = CASE
    WHEN trim(coalesce(checkin_status, '')) = '지각' THEN '지각'
    ELSE '정상 출근'
  END
WHERE user_id = (SELECT id::text FROM public.users WHERE name = '조건희' LIMIT 1)
  AND coalesce(work_date, date) = DATE '2026-04-21';

COMMIT;
