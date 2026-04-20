import { supabaseAdmin, supabaseAuthVerifier } from "@/app/_lib/supabaseAdminServer";

export async function getRequesterFromToken(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return { error: "인증 토큰이 없습니다.", status: 401 as const, requester: null };
  const token = auth.slice(7).trim();
  if (!token) return { error: "인증 토큰이 없습니다.", status: 401 as const, requester: null };

  const { data: authData, error: authErr } = await supabaseAuthVerifier.auth.getUser(token);
  if (authErr || !authData.user) return { error: "유효하지 않은 인증입니다.", status: 401 as const, requester: null };

  const { data: requester, error: reqErr } = await supabaseAdmin
    .from("users")
    .select("id, role, approval_status, auth_user_id, name, rank, team_name, email")
    .eq("auth_user_id", authData.user.id)
    .maybeSingle();
  if (reqErr || !requester) return { error: "직원 계정 확인에 실패했습니다.", status: 403 as const, requester: null };

  if ((requester as { approval_status?: string | null }).approval_status !== "approved") {
    return { error: "승인된 사용자만 접근할 수 있습니다.", status: 403 as const, requester: null };
  }

  return {
    error: null,
    status: 200 as const,
    requester: requester as {
      id: string;
      role: string;
      name?: string | null;
      auth_user_id?: string | null;
      rank?: string | null;
      team_name?: string | null;
      email?: string | null;
    },
  };
}
