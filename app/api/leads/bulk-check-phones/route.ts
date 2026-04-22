import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";
import { isAdmin } from "@/app/(admin)/_lib/rolePermissions";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { formatKoreanMobile, isValidKoreanMobile010 } from "@/app/(admin)/_lib/bulkLeadPhone";

const BodySchema = z.object({
  phones: z.array(z.string()).max(500),
});

export async function POST(req: Request) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) return NextResponse.json({ error: auth.error }, { status: auth.status });

  if (
    !isAdmin({
      id: auth.requester.id,
      role: auth.requester.role,
      rank: auth.requester.rank,
      email: auth.requester.email,
    })
  ) {
    return NextResponse.json({ error: "관리자만 접근할 수 있습니다." }, { status: 403 });
  }

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const normalized = [
    ...new Set(
      parsed.data.phones
        .map((p) => formatKoreanMobile(p).trim())
        .filter((p) => isValidKoreanMobile010(p))
    ),
  ];
  if (normalized.length === 0) {
    return NextResponse.json({ ok: true, existing: [] as const });
  }

  const { data: leadRows, error: leadErr } = await supabaseAdmin
    .from("leads")
    .select("phone,name,manager_user_id")
    .in("phone", normalized);
  if (leadErr) {
    return NextResponse.json({ error: "중복 조회에 실패했습니다." }, { status: 500 });
  }

  const managerIds = [
    ...new Set(
      (leadRows ?? [])
        .map((r) => (r as { manager_user_id?: string | null }).manager_user_id)
        .filter((id): id is string => !!id && String(id).trim() !== "")
    ),
  ];

  const managerNameById = new Map<string, string>();
  if (managerIds.length > 0) {
    const { data: users, error: userErr } = await supabaseAdmin
      .from("users")
      .select("id,name")
      .in("id", managerIds);
    if (!userErr && users) {
      for (const u of users as Array<{ id: string; name?: string | null }>) {
        managerNameById.set(u.id, (u.name ?? "").trim() || "담당자");
      }
    }
  }

  const existing = (leadRows ?? []).map((r) => {
    const row = r as { phone?: string; name?: string | null; manager_user_id?: string | null };
    const mid = row.manager_user_id ?? null;
    return {
      phone: String(row.phone ?? "").trim(),
      customerName: String(row.name ?? "").trim() || "(이름 없음)",
      managerUserId: mid,
      managerName: mid ? (managerNameById.get(mid) ?? "담당자") : "미지정",
    };
  });

  return NextResponse.json({ ok: true, existing });
}
