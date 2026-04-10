# 근태(attendance) · RLS 점검 가이드

## 스키마 요약 (`schema.sql`)

- `public.attendance.user_id`는 **`text not null`** 이며, 앱에서는 **`public.users.id`(UUID 문자열)** 와 동일한 값을 넣도록 맞춥니다.
- DB 레벨 **`REFERENCES public.users(id)`** 는 현재 없습니다. 존재하지 않는 UUID를 넣어도 PostgreSQL이 거절하지 않으므로, 앱에서 **`listActiveUsers` / `resolveTempAdminProfile`** 로 실제 행 id만 쓰는 것이 중요합니다.
- `created_at`는 `default now()` 로 자동 생성됩니다.
- `unique (user_id, date)` 로 하루 1행이 보장되며, 클라이언트는 `upsert(..., onConflict: "user_id,date")` 를 사용합니다.

## RLS (Row Level Security)

이 저장소의 `schema.sql` 안에는 **`attendance` 테이블에 대한 `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` 나 정책 정의가 포함되어 있지 않습니다.**

Supabase 대시보드에서 아래를 직접 확인하세요.

1. **Table Editor → attendance → (톱니) → Policies** 또는 SQL:

   ```sql
   select tablename, rowsecurity
   from pg_tables
   where schemaname = 'public' and tablename = 'attendance';

   select policyname, permissive, roles, cmd, qual, with_check
   from pg_policies
   where schemaname = 'public' and tablename = 'attendance';
   ```

2. **RLS가 켜져 있고 정책이 없으면** 익명/인증 클라이언트는 **모든 작업이 거부**됩니다. 이 경우 PostgREST 에러(예: permission denied, RLS)가 **브라우저 콘솔·alert**에 그대로 노출되도록 `checkIn` 등에서 이미 메시지를 전달합니다.

3. **일반적인 개발용 패턴(참고만)**  
   - 서버 사이드만 접근: `service_role` 키는 클라이언트에 두지 말 것.  
   - 클라이언트에서 직접 upsert: `auth.uid()` 와 `users.auth_user_id` 를 연결한 뒤, `user_id` 가 본인 행과 일치할 때만 `insert/update` 허용하는 정책이 필요합니다.

4. **`public.users` SELECT**  
   임시 관리자 모드는 `listActiveUsers()` 로 직원 목록을 읽습니다. `users` 에 RLS가 있고 select 가 막혀 있으면 `resolveTempAdminProfile()` 이 실패합니다.

## 오류 발생 시 확인 순서

1. 콘솔: `checkIn currentUserId`, `user`, `payload`, `error` 로그.
2. `currentUserId` 가 UUID 형태인지, `users` 테이블에 해당 `id` 행이 있는지.
3. 대시보드에서 `attendance` RLS 및 정책.
4. PostgREST 에러 본문(`message`, `details`, `hint`, `code`).
