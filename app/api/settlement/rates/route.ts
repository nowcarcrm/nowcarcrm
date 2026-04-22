import { NextResponse } from "next/server";
import { z } from "zod";
import { isSuperAdmin } from "@/app/(admin)/_lib/rolePermissions";
import { logSettlementAudit } from "@/app/(admin)/_lib/settlement/auditLog";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";

type RateTemplateRow = {
  id: string;
  user_id: string;
  base_rate: number;
  eligible_incentive: boolean;
  incentive_per_tier_percent: number | null;
  include_sliding: boolean;
  is_excluded: boolean;
  special_note: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

function asNumber(value: unknown, fallback = 0) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return n;
}

function rankOrder(rank: string | null | undefined) {
  const r = (rank ?? "").trim();
  switch (r) {
    case "총괄대표":
      return 1;
    case "대표":
      return 2;
    case "본부장":
      return 3;
    case "팀장":
      return 4;
    case "차장":
      return 5;
    case "과장":
      return 6;
    case "대리":
      return 7;
    case "주임":
      return 8;
    default:
      return 99;
  }
}

async function assertSuperAdmin(req: Request) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) {
    return { ok: false as const, response: NextResponse.json({ error: auth.error }, { status: auth.status }) };
  }
  if (!isSuperAdmin({ email: auth.requester.email, role: auth.requester.role, rank: auth.requester.rank })) {
    return { ok: false as const, response: NextResponse.json({ error: "총괄대표만 접근할 수 있습니다." }, { status: 403 }) };
  }
  return { ok: true as const, requester: auth.requester };
}

export async function GET(req: Request) {
  const guard = await assertSuperAdmin(req);
  if (!guard.ok) return guard.response;

  const { data: templates, error: templateErr } = await supabaseAdmin
    .from("settlement_rate_templates")
    .select(
      "id,user_id,base_rate,eligible_incentive,incentive_per_tier_percent,include_sliding,is_excluded,special_note,created_at,updated_at,updated_by"
    );
  if (templateErr) {
    return NextResponse.json({ error: "요율 템플릿 조회에 실패했습니다." }, { status: 500 });
  }

  const userIds = Array.from(
    new Set(
      (templates ?? [])
        .map((r) => (r as { user_id?: string | null }).user_id)
        .filter((v): v is string => !!v)
    )
  );
  const updatedByIds = Array.from(
    new Set(
      (templates ?? [])
        .map((r) => (r as { updated_by?: string | null }).updated_by)
        .filter((v): v is string => !!v)
    )
  );
  const allUserIds = Array.from(new Set([...userIds, ...updatedByIds]));

  const userById = new Map<string, { name: string; email: string; rank: string; team_name: string | null; division_name: string | null }>();
  if (allUserIds.length > 0) {
    const { data: users, error: userErr } = await supabaseAdmin
      .from("users")
      .select("id,name,email,rank,team_name,division_name")
      .in("id", allUserIds);
    if (userErr) {
      return NextResponse.json({ error: "사용자 정보 조회에 실패했습니다." }, { status: 500 });
    }
    for (const u of (users ?? []) as Array<Record<string, unknown>>) {
      const id = String(u.id ?? "");
      if (!id) continue;
      userById.set(id, {
        name: String(u.name ?? "").trim() || "(이름없음)",
        email: String(u.email ?? "").trim(),
        rank: String(u.rank ?? "").trim(),
        team_name: u.team_name == null ? null : String(u.team_name),
        division_name: u.division_name == null ? null : String(u.division_name),
      });
    }
  }

  const rows = (templates ?? []).map((raw) => {
    const t = raw as RateTemplateRow;
    const owner = userById.get(t.user_id);
    const updater = t.updated_by ? userById.get(t.updated_by) : null;
    return {
      id: t.id,
      user_id: t.user_id,
      user_name: owner?.name ?? "(알수없음)",
      user_email: owner?.email ?? "",
      user_rank: owner?.rank ?? "",
      user_team_name: owner?.team_name ?? null,
      user_division_name: owner?.division_name ?? null,
      base_rate: asNumber(t.base_rate, 0),
      eligible_incentive: !!t.eligible_incentive,
      incentive_per_tier_percent: asNumber(t.incentive_per_tier_percent, 5),
      include_sliding: !!t.include_sliding,
      is_excluded: !!t.is_excluded,
      special_note: t.special_note ?? null,
      created_at: t.created_at,
      updated_at: t.updated_at,
      updated_by: t.updated_by ?? null,
      updated_by_name: updater?.name ?? null,
    };
  });

  rows.sort((a, b) => {
    if (a.is_excluded !== b.is_excluded) return a.is_excluded ? 1 : -1;
    const aTeam = a.user_team_name ?? "";
    const bTeam = b.user_team_name ?? "";
    if (aTeam !== bTeam) return aTeam.localeCompare(bTeam, "ko");
    const rDiff = rankOrder(a.user_rank) - rankOrder(b.user_rank);
    if (rDiff !== 0) return rDiff;
    return a.user_name.localeCompare(b.user_name, "ko");
  });

  return NextResponse.json({ rows });
}

const CreateSchema = z.object({
  user_id: z.string().uuid(),
  base_rate: z.number().min(0).max(100),
  eligible_incentive: z.boolean(),
  incentive_per_tier_percent: z.number().min(0).max(100).default(5),
  include_sliding: z.boolean().default(false),
  is_excluded: z.boolean().default(false),
  special_note: z.string().trim().max(1000).nullable().optional(),
});

export async function POST(req: Request) {
  const guard = await assertSuperAdmin(req);
  if (!guard.ok) return guard.response;

  const parsed = CreateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const payload = parsed.data;
  const { data: user, error: userErr } = await supabaseAdmin
    .from("users")
    .select("id,name")
    .eq("id", payload.user_id)
    .maybeSingle();
  if (userErr || !user) {
    return NextResponse.json({ error: "대상 직원을 찾을 수 없습니다." }, { status: 404 });
  }

  const { data: exists, error: existsErr } = await supabaseAdmin
    .from("settlement_rate_templates")
    .select("id")
    .eq("user_id", payload.user_id)
    .maybeSingle();
  if (existsErr) {
    return NextResponse.json({ error: "기존 템플릿 확인에 실패했습니다." }, { status: 500 });
  }
  if (exists) {
    return NextResponse.json({ error: "이미 요율 템플릿이 존재합니다." }, { status: 409 });
  }

  const insertPayload = {
    user_id: payload.user_id,
    base_rate: payload.is_excluded ? 0 : payload.base_rate,
    eligible_incentive: payload.eligible_incentive,
    incentive_per_tier_percent: payload.incentive_per_tier_percent,
    include_sliding: payload.include_sliding,
    is_excluded: payload.is_excluded,
    special_note: payload.special_note ?? null,
    updated_by: guard.requester.id,
  };

  const { data: created, error: createErr } = await supabaseAdmin
    .from("settlement_rate_templates")
    .insert(insertPayload)
    .select(
      "id,user_id,base_rate,eligible_incentive,incentive_per_tier_percent,include_sliding,is_excluded,special_note,created_at,updated_at,updated_by"
    )
    .single();
  if (createErr || !created) {
    return NextResponse.json({ error: "요율 템플릿 생성에 실패했습니다." }, { status: 500 });
  }

  await logSettlementAudit({
    action: "rate_template_created",
    entityType: "rate_template",
    entityId: created.id,
    targetUserId: created.user_id,
    performedBy: guard.requester.id,
    details: { after: created },
  });

  return NextResponse.json({ row: created });
}
