/**
 * Supabase Auth 등 영문 오류를 로그인·회원가입 UI용 한국어로 바꿉니다.
 */
export function authErrorMessageKo(raw: string | null | undefined): string {
  if (raw == null) return "";
  const t = String(raw).trim();
  if (!t) return "";

  const lower = t.toLowerCase();

  if (lower.includes("invalid login credentials")) {
    return "이메일 또는 비밀번호가 올바르지 않습니다.";
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
    return "관리자 승인 후 이용 가능합니다.";
  }
  if (lower.includes("승인 대기")) {
    return "관리자 승인 후 이용 가능합니다.";
  }
  if (lower.includes("rejected")) {
    return "가입 승인이 거절된 계정입니다. 관리자에게 문의하세요.";
  }
  if (lower.includes("사용 중지 계정") || lower.includes("is_active")) {
    return "사용 중지 계정입니다. 관리자에게 문의하세요.";
  }
  if (lower.includes("crm 프로필 없음") || lower.includes("public.users")) {
    return "CRM 프로필이 아직 준비되지 않았습니다. 관리자에게 계정 등록을 요청해 주세요.";
  }
  if (lower.includes("세션 생성 실패")) {
    return "세션 생성에 실패했습니다. 이메일 인증 상태와 Supabase 설정을 확인해 주세요.";
  }
  if (
    lower.includes("supabase env is missing") ||
    lower.includes("service role") ||
    lower.includes("project")
  ) {
    return "서버 설정 오류가 감지되었습니다. 관리자에게 환경변수 설정을 확인해 달라고 요청해 주세요.";
  }
  if (lower.includes("too many requests") || lower.includes("rate limit")) {
    return "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";
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
