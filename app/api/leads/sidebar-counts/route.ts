import { NextResponse } from "next/server";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";

type SidebarCountKey =
  | "new"
  | "counseling"
  | "unresponsive"
  | "contract"
  | "delivered"
  | "hold"
  | "cancel";

type SidebarCounts = Record<SidebarCountKey, number>;

const EMPTY_COUNTS: SidebarCounts = {
  new: 0,
  counseling: 0,
  unresponsive: 0,
  contract: 0,
  delivered: 0,
  hold: 0,
  cancel: 0,
};

function toCountKey(status: string): SidebarCountKey | null {
  const s = status.trim();
  if (s === "신규") return "new";
  if (s === "상담중") return "counseling";
  if (s === "부재") return "unresponsive";
  if (s === "계약완료" || s === "확정" || s === "출고") return "contract";
  if (s === "인도완료") return "delivered";
  if (s === "보류") return "hold";
  if (s === "취소") return "cancel";
  return null;
}

export async function GET(req: Request) {
  try {
    const auth = await getRequesterFromToken(req);
    if (!auth.requester) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const query = supabaseAdmin
      .from("leads")
      .select("status")
      .eq("manager_user_id", auth.requester.id);

    const { data, error } = await query;
    if (error) {
      console.error("[sidebar-counts] query error:", error);
      return NextResponse.json({ error: "카운트 조회 실패" }, { status: 500 });
    }

    const counts: SidebarCounts = { ...EMPTY_COUNTS };
    for (const row of (data ?? []) as Array<{ status?: string | null }>) {
      const key = toCountKey(String(row.status ?? ""));
      if (!key) continue;
      counts[key] += 1;
    }

    return NextResponse.json(counts);
  } catch (error) {
    console.error("[sidebar-counts] 500 error:", error);
    console.error(
      "[sidebar-counts] error message:",
      error instanceof Error ? error.message : String(error)
    );
    console.error(
      "[sidebar-counts] error stack:",
      error instanceof Error ? error.stack : undefined
    );
    return NextResponse.json({ error: "사이드바 카운트 조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}
