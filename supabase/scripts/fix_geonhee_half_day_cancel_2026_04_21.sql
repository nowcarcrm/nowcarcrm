-- 조건희 팀장: 2026-04-21 반차 취소 + 잔여 연차 9 + 해당일 근태 정상 출근
-- 코드 기준 컬럼명: leave_requests(user_id, request_type, from_date, to_date, status)
--                    users(name, remaining_annual_leave)
--                    attendance(user_id, date, work_date, status, checkin_status)
--
-- Supabase SQL Editor에서 실행하세요.

BEGIN;

-- 1) 2026-04-21이 구간에 포함되는 반차(half) 요청 → cancelled
UPDATE public.leave_requests
SET status = 'cancelled'
WHERE user_id = (SELECT id FROM public.users WHERE trim(name) = '조건희' LIMIT 1)
  AND request_type = 'half'
  AND from_date <= DATE '2026-04-21'
  AND to_date >= DATE '2026-04-21';

-- 2) 조건희 잔여 연차 9 (numeric(4,1) — 정수 9로 저장)
UPDATE public.users
SET remaining_annual_leave = 9
WHERE trim(name) = '조건희';

-- 3) 해당일 근태: 상태 정상 출근으로 복구 (출근 시각이 있으면 checkin_status는 지각만 유지)
UPDATE public.attendance
SET
  status = '정상 출근',
  checkin_status = CASE
    WHEN trim(coalesce(checkin_status, '')) = '지각' THEN '지각'
    ELSE '정상 출근'
  END
WHERE (user_id::text = (SELECT id::text FROM public.users WHERE trim(name) = '조건희' LIMIT 1))
  AND coalesce(work_date, date) = DATE '2026-04-21';

COMMIT;
