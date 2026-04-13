import type { AuthProfile } from "@/app/(admin)/_lib/authSupabase";

/** 로그인 직후·세션 복구 시 내부 라우팅 목적지 (브라우저 전용 호출부에서 사용) */
export function getPostLoginPath(profile: AuthProfile): string {
  if (!profile.isActive) return "/login";
  if (profile.role === "admin") return "/admin";
  if (profile.role === "staff") {
    return profile.approved ? "/dashboard" : "/pending-approval";
  }
  return "/dashboard";
}
