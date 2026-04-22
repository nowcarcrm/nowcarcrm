import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { computeUserSettlement } from "@/app/(admin)/_lib/settlement/aggregator";
import { getDeliveryScope } from "@/app/(admin)/_lib/settlement/permissions";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";

const QuerySchema = z.object({
  user_id: z.string().uuid(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
});

export async function GET(req: Request) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    user_id: (url.searchParams.get("user_id") ?? "").trim(),
    month: (url.searchParams.get("month") ?? "").trim(),
  });
  if (!parsed.success) return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });

  const scope = getDeliveryScope(auth.requester);
  if (scope.scope === "own" && scope.user_id !== parsed.data.user_id) {
    return NextResponse.json({ error: "조회 권한이 없습니다." }, { status: 403 });
  }
  if (scope.scope === "team") {
    const { data: owner } = await supabaseAdmin.from("users").select("team_name").eq("id", parsed.data.user_id).maybeSingle();
    if (!owner || String(owner.team_name ?? "") !== scope.team_name) {
      return NextResponse.json({ error: "조회 권한이 없습니다." }, { status: 403 });
    }
  }

  const result = await computeUserSettlement(parsed.data.user_id, parsed.data.month);
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
