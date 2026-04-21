import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseAuthVerifier } from "@/app/_lib/supabaseAdminServer";
import { canViewAttendance } from "@/app/(admin)/_lib/rolePermissions";
import { eachDayInclusive } from "@/app/(admin)/_lib/leaveDateRange";

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

function monthHalfOpenRange(month: string): { from: string; toLt: string } {
  const [ys, ms] = month.split("-");
  const y = Number(ys);
  const m = Number(ms);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    const d = new Date();
    const fy = d.getFullYear();
    const fm = d.getMonth() + 1;
    return { from: `${fy}-${String(fm).padStart(2, "0")}-01`, toLt: `${fy}-${String(fm + 1).padStart(2, "0")}-01` };
  }
  const from = `${y}-${String(m).padStart(2, "0")}-01`;
  const toLt = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { from, toLt };
}

function rowDateKey(row: { work_date?: string | null; date?: string | null }): string {
  const raw = (row.work_date ?? row.date ?? "").toString().trim();
  return raw.split("T")[0] ?? "";
}

function formatCheckInNote(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return `출근 ${d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`;
}

type UserLite = {
  id: string;
  name: string | null;
  rank: string | null;
  team_name: string | null;
  role: string | null;
  email: string | null;
  approval_status: string | null;
  remaining_annual_leave?: number | null;
};

async function getUserByAuthId(authUserId: string): Promise<UserLite | null> {
  const cols = "id,name,rank,team_name,role,email,approval_status,remaining_annual_leave";
  const { data: a, error: e1 } = await supabaseAdmin.from("users").select(cols).eq("auth_user_id", authUserId).maybeSingle();
  if (e1) throw new Error(e1.message);
  if (a) return a as UserLite;
  const { data: b, error: e2 } = await supabaseAdmin.from("users").select(cols).eq("id", authUserId).maybeSingle();
  if (e2) throw new Error(e2.message);
  return (b as UserLite | null) ?? null;
}

function toViewerTarget(u: UserLite) {
  return {
    id: u.id,
    rank: u.rank,
    role: u.role,
    team_name: u.team_name,
    name: u.name,
    email: u.email,
  };
}

export async function GET(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "인증 토큰이 없습니다." }, { status: 401 });

    const { data: authData, error: authErr } = await supabaseAuthVerifier.auth.getUser(token);
    if (authErr || !authData.user) {
      return NextResponse.json({ error: "유효하지 않은 인증입니다." }, { status: 401 });
    }

    const viewer = await getUserByAuthId(authData.user.id);
    if (!viewer || viewer.approval_status !== "approved") {
      return NextResponse.json({ error: "승인된 사용자만 조회할 수 있습니다." }, { status: 403 });
    }

    const { userId } = await params;
    if (!userId?.trim()) return NextResponse.json({ error: "직원 ID가 필요합니다." }, { status: 400 });

    const { data: target, error: tErr } = await supabaseAdmin
      .from("users")
      .select("id,name,rank,team_name,role,email,approval_status,remaining_annual_leave")
      .eq("id", userId.trim())
      .maybeSingle();
    if (tErr) throw new Error(tErr.message);
    if (!target || target.approval_status !== "approved") {
      return NextResponse.json({ error: "직원을 찾을 수 없습니다." }, { status: 404 });
    }

    if (!canViewAttendance(toViewerTarget(viewer as UserLite), toViewerTarget(target as UserLite))) {
      return NextResponse.json({ error: "이 직원의 근태 상세를 볼 권한이 없습니다." }, { status: 403 });
    }

    const monthParam = new URL(req.url).searchParams.get("month")?.trim() ?? "";
    const month = /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    })();

    const { from, toLt } = monthHalfOpenRange(month);

    const { data: attByDate } = await supabaseAdmin
      .from("attendance")
      .select("id,date,work_date,status,check_in,check_in_at,memo,checkin_status")
      .eq("user_id", userId.trim())
      .gte("date", from)
      .lt("date", toLt);
    const { data: attByWork } = await supabaseAdmin
      .from("attendance")
      .select("id,date,work_date,status,check_in,check_in_at,memo,checkin_status")
      .eq("user_id", userId.trim())
      .gte("work_date", from)
      .lt("work_date", toLt);

    const attMap = new Map<string, Record<string, unknown>>();
    for (const r of [...(attByDate ?? []), ...(attByWork ?? [])]) {
      const row = r as Record<string, unknown>;
      attMap.set(String(row.id), row);
    }
    const attendanceRows = Array.from(attMap.values());

    const { data: leaves } = await supabaseAdmin
      .from("leave_requests")
      .select("id,from_date,to_date,reason,status,request_type,used_amount")
      .eq("user_id", userId.trim())
      .eq("status", "approved")
      .order("from_date", { ascending: false })
      .limit(80);

    const kindFromRequestType = (t: string) => {
      if (t === "half") return "반차";
      if (t === "sick") return "병가";
      if (t === "field_work") return "외근";
      return "연차";
    };

    type Line = { date: string; kind: string; reason: string | null; note: string | null };
    const lines: Line[] = [];

    for (const raw of attendanceRows) {
      const r = raw as {
        date?: string | null;
        work_date?: string | null;
        status?: string | null;
        memo?: string | null;
        check_in?: string | null;
        check_in_at?: string | null;
        checkin_status?: string | null;
      };
      const date = rowDateKey(r);
      if (!date) continue;
      const st = (r.status ?? "").trim() || "-";
      const checkIn = r.check_in ?? r.check_in_at ?? null;
      let note: string | null = null;
      if (st === "지각" || r.checkin_status === "지각") {
        note = formatCheckInNote(checkIn);
      }
      lines.push({
        date,
        kind: st,
        reason: r.memo?.trim() || null,
        note,
      });
    }

    const covered = new Set(lines.map((l) => `${l.date}|${l.kind}`));
    for (const lr of leaves ?? []) {
      const row = lr as {
        from_date: string;
        to_date: string;
        reason: string | null;
        request_type: string | null;
      };
      const fromD = String(row.from_date ?? "").split("T")[0];
      const toD = String(row.to_date ?? "").split("T")[0];
      if (!fromD || !toD) continue;
      const kind = kindFromRequestType(String(row.request_type ?? "annual"));
      for (const day of eachDayInclusive(fromD, toD)) {
        if (day < from || day >= toLt) continue;
        const key = `${day}|${kind}`;
        if (covered.has(key)) continue;
        covered.add(key);
        lines.push({ date: day, kind, reason: row.reason?.trim() || null, note: null });
      }
    }

    lines.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return a.kind.localeCompare(b.kind, "ko");
    });

    return NextResponse.json({
      month,
      target: {
        id: target.id,
        name: target.name ?? "직원",
        rank: target.rank ?? null,
        teamName: target.team_name ?? null,
        remainingAnnualLeave: Number(target.remaining_annual_leave ?? 12),
      },
      lines,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "근태 상세 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
