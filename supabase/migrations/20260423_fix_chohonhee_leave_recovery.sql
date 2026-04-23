-- ============================================
-- 조건희 팀장 잘못 승인된 연차 복구 (데이터 정리)
-- 대상 기간: 2026-04-22 ~ 2026-04-24
-- 실행 전: 아래 "진단용" 쿼리로 id·used_amount·잔여연차 확인 후 Supabase SQL Editor에서 수동 실행.
-- 스키마: leave_requests(from_date, to_date, request_type, used_amount, status)
--         users.remaining_annual_leave
--         attendance(status: 승인 시 '연차' 등으로 sync)
-- ============================================

-- --- 진단용 ---
-- SELECT id, name, rank, remaining_annual_leave FROM public.users WHERE name = '조건희';
--
-- SELECT id, user_id, requested_by, request_type, used_amount, from_date, to_date, status, reason, created_at
-- FROM public.leave_requests
-- WHERE user_id = (SELECT id FROM public.users WHERE name = '조건희' LIMIT 1)
--   AND from_date <= '2026-04-24'
--   AND to_date >= '2026-04-22'
--   AND request_type = 'annual'
-- ORDER BY created_at DESC;
--
-- SELECT id, user_id, date, work_date, status, check_in, check_in_at, check_out, check_out_at
-- FROM public.attendance
-- WHERE user_id = (SELECT id FROM public.users WHERE name = '조건희' LIMIT 1)
--   AND (
--     (date IS NOT NULL AND date::date BETWEEN '2026-04-22' AND '2026-04-24')
--     OR (work_date IS NOT NULL AND work_date::date BETWEEN '2026-04-22' AND '2026-04-24')
--   );

-- 1+2) 승인 건만 cancelled 로 바꾸고, 그 건의 used_amount 합만큼 잔여 연차 복구 (재실행 시 approved 가 없으면 가산 0)
WITH picked AS (
  SELECT lr.id, lr.used_amount
  FROM public.leave_requests lr
  WHERE lr.user_id = (SELECT id FROM public.users WHERE name = '조건희' LIMIT 1)
    AND lr.from_date = '2026-04-22'
    AND lr.to_date = '2026-04-24'
    AND lr.request_type = 'annual'
    AND lr.status = 'approved'
),
cancelled AS (
  UPDATE public.leave_requests lr
  SET status = 'cancelled',
      updated_at = NOW()
  FROM picked p
  WHERE lr.id = p.id
  RETURNING lr.used_amount
)
UPDATE public.users u
SET remaining_annual_leave = u.remaining_annual_leave + COALESCE(
  (SELECT SUM(used_amount)::numeric(4, 1) FROM cancelled),
  0
)
WHERE u.name = '조건희';

-- 3) 해당일 attendance 가 휴가계열이면 미출근으로 되돌림 (출근 버튼 다시 사용 가능)
UPDATE public.attendance a
SET status = '미출근'
WHERE a.user_id = (SELECT id FROM public.users WHERE name = '조건희' LIMIT 1)
  AND a.status IN ('연차', '반차', '병가', '휴가')
  AND (
    (a.date IS NOT NULL AND a.date::date BETWEEN '2026-04-22' AND '2026-04-24')
    OR (a.work_date IS NOT NULL AND a.work_date::date BETWEEN '2026-04-22' AND '2026-04-24')
  );
