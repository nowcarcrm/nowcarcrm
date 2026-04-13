/**
 * 인증 관련 영문 오류를 로그인·회원가입 UI용 한국어로 바꿉니다.
 */
export function authErrorMessageKo(raw: string | null | undefined): string {
  if (raw == null) return "";
  const t = String(raw).trim();
  if (!t) return "";

  const lower = t.toLowerCase();

  if (lower.includes("invalid login credentials")) {
    return "이메일 또는 비밀번호가 올바르지 않습니다. (비밀번호 재설정·회원가입·이메일 인증·프로젝트 URL/키도 확인하세요.)";
  }
  if (lower.includes("auth session missing") || lower.includes("session missing")) {
    return "세션 생성에 실패했거나 만료되었습니다. 다시 로그인해 주세요.";
  }
  if (lower.includes("email not confirmed") || lower.includes("not confirmed")) {
    return "이메일 인증이 완료되지 않았습니다. 메일함을 확인해 주세요.";
  }
  if (lower.includes("user already registered") || lower.includes("already been registered")) {
    return "이미 가입된 이메일입니다.";
  }
  if (lower.includes("password") && lower.includes("least") && lower.includes("6")) {
    return "비밀번호는 6자 이상이어야 합니다.";
  }
  if (lower === "pending" || lower.includes("approval_status: pending")) {
    return "관리자 승인 대기중입니다.";
  }
  if (lower.includes("승인 대기")) {
    return "관리자 승인 대기중입니다.";
  }
  if (lower.includes("rejected")) {
    return "승인 거절된 계정입니다. 관리자에게 문의하세요.";
  }
  if (lower.includes("사용 중지 계정") || lower.includes("is_active")) {
    return "사용 중지 계정입니다. 관리자에게 문의하세요.";
  }
  if (lower.includes("crm 프로필 없음") || lower.includes("public.users")) {
    return "직원 계정 정보가 없습니다. 관리자에게 문의하세요.";
  }
  if (lower.includes("세션 생성 실패")) {
    return "세션 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (
    lower.includes("supabase env is missing") ||
    lower.includes("service role") ||
    lower.includes("project")
  ) {
    return "서버 설정 오류가 감지되었습니다. 관리자에게 문의해 주세요.";
  }
  if (lower.includes("too many requests") || lower.includes("rate limit")) {
    return "같은 이메일로 요청이 너무 자주 발생했습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (
    lower.includes("otp expired") ||
    lower.includes("flow state") ||
    lower.includes("invalid_grant") ||
    lower.includes("expired") && (lower.includes("token") || lower.includes("link"))
  ) {
    return "링크가 만료되었거나 이미 사용되었습니다. 비밀번호 재설정을 다시 요청해 주세요.";
  }
  if (lower.includes("network") || lower.includes("fetch")) {
    return "네트워크 오류가 발생했습니다. 연결을 확인해 주세요.";
  }

  return t;
}

type AuthDiagnosePayload = {
  ok?: boolean;
  error?: string;
  existsInAuthUsers?: boolean;
  user?: { emailConfirmed?: boolean } | null;
};

/**
 * 로그인 실패(Invalid login credentials) 시 /api/auth/diagnose 결과를 붙여 원인 추적을 돕습니다.
 */
export function enhanceInvalidLoginWithDiagnose(
  raw: string,
  diagnose: unknown
): string {
  const base = authErrorMessageKo(raw);
  const lower = String(raw).toLowerCase();
  if (!lower.includes("invalid login credentials")) {
    return base;
  }

  const d = diagnose as AuthDiagnosePayload | undefined;
  if (!d || typeof d !== "object") {
    return `${base} (진단 API 응답 없음 — 서비스 롤 키·네트워크 확인)`;
  }
  if (d.error && !d.ok) {
    return `${base} (진단 실패: ${d.error})`;
  }
  if (d.ok === true && d.existsInAuthUsers === false) {
    return `${base} [진단] Supabase Auth에 이 이메일 사용자가 없습니다. 회원가입 여부와 .env의 NEXT_PUBLIC_SUPABASE_URL·ANON 키가 가입 시와 동일한 프로젝트인지 확인하세요.`;
  }
  if (d.ok === true && d.user && d.user.emailConfirmed === false) {
    return `${base} [진단] 이메일 미인증입니다. 가입 확인 메일의 링크를 누르거나, 대시보드 Authentication → Providers에서 이메일 확인을 끈 뒤 다시 시도하세요.`;
  }
  if (d.ok === true && d.existsInAuthUsers) {
    return `${base} [진단] Auth 사용자는 있습니다. 비밀번호 오타·다른 프로젝트에 가입·비밀번호 재설정을 시도해 보세요.`;
  }
  return base;
}
