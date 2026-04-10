# Supabase Auth — Site URL / Redirect URL (비밀번호 재설정·PKCE)

앱은 **PKCE** 흐름을 쓰고, 재설정 메일의 `redirectTo`는 **`/auth/callback`** 입니다. 콜백에서 `exchangeCodeForSession` 후 **`/reset-password`** 로 이동합니다.

## Dashboard 설정 위치

Supabase Dashboard → **Authentication** → **URL Configuration**

### Site URL

- **로컬 개발**: `http://localhost:3000` (또는 실제로 쓰는 포트)
- **운영**: `https://your-production-domain.com`

단일 프로덕션 도메인만 쓸 경우 Site URL은 그 도메인 하나로 두면 됩니다.

### Redirect URLs (Additional Redirect URLs)

아래 **전체 문자열**을 각각 추가합니다 (쿼리 포함 시 그대로).

**localhost (포트 3000 예시)**

- `http://localhost:3000/auth/callback`
- `http://localhost:3000/auth/callback?next=%2Freset-password`
- (선택) 토큰 방식 이메일만 쓸 때: `http://localhost:3000/reset-password`

**운영**

- `https://your-production-domain.com/auth/callback`
- `https://your-production-domain.com/auth/callback?next=%2Freset-password`
- (선택) `https://your-production-domain.com/reset-password`

> `next` 쿼리 값은 `encodeURIComponent("/reset-password")` 와 동일하게 `%2Freset-password` 로 등록하는 것이 안전합니다. Supabase가 `redirect_to` 전체를 허용 목록과 비교합니다.

## 앱 쪽 동작 요약

| 경로 | 역할 |
|------|------|
| `/forgot-password` | `resetPasswordForEmail` — `redirectTo` → `/auth/callback?next=/reset-password` |
| `/auth/callback` | `?code=` → `exchangeCodeForSession` → `router.replace(next)` |
| `/reset-password` | `?code=`(직접 온 경우)·해시 토큰·또는 이미 저장된 세션으로 폼 표시 후 `updateUser({ password })` |

## Middleware

이 프로젝트는 **인증용 Next middleware로 위 경로를 막지 않습니다.** (루트에 리다이렉트 미들웨어가 없음)  
나중에 middleware를 추가할 경우 **`/login`, `/signup`, `/forgot-password`, `/reset-password`, `/auth/callback`** 은 통과시켜야 합니다.
