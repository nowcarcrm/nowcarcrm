import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";
import {
  appendAuditForCreate,
  canAssignOwner,
  mapDeliveriesWithNames,
  monthRangeFilter,
  toDeliveryRow,
  type Requester,
  ensureOwnerTemplate,
} from "./_lib";
import { getDeliveryScope } from "@/app/(admin)/_lib/settlement/permissions";
import { isSuperAdmin } from "@/app/(admin)/_lib/rolePermissions";
import type { Delivery, DeliveryCreateInput } from "@/app/(admin)/_types/settlement";

const createSchema = z.object({
  owner_id: z.string().uuid(),
  lead_id: z.number().int().positive().nullable().optional(),
  financial_company: z.string().min(1).max(100),
  product_type: z.enum(["rent", "lease"]),
  contract_date: z.string().trim().nullable().optional(),
  delivery_date: z.string().trim().min(1),
  registration_date: z.string().trim().nullable().optional(),
  customer_name: z.string().trim().min(1).max(100),
  car_model: z.string().trim().min(1).max(100),
  car_price: z.number().min(0),
  ag_commission: z.number().min(0),
  etc_revenue: z.number().min(0).optional(),
  customer_support: z.number().min(0).optional(),
  delivery_type: z.enum(["special", "dealer"]),
  dealer_name: z.string().trim().nullable().optional(),
  dealer_contract_no: z.string().trim().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
});

function monthNow() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function GET(req: Request) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const requester = auth.requester as Requester;

  const url = new URL(req.url);
  const month = (url.searchParams.get("month") ?? monthNow()).trim();
  const status = (url.searchParams.get("status") ?? "").trim();
  const ownerId = (url.searchParams.get("owner_id") ?? "").trim();
  const team = (url.searchParams.get("team") ?? "").trim();
  const includeDeleted = url.searchParams.get("include_deleted") === "true";

  const { start, end } = monthRangeFilter(month);
  let query = supabaseAdmin
    .from("settlement_deliveries")
    .select("*")
    .gte("delivery_date", start)
    .lt("delivery_date", end)
    .order("delivery_date", { ascending: false });

  if (!(includeDeleted && isSuperAdmin(requester))) {
    query = query.is("deleted_at", null);
  }
  if (status) {
    const statuses = status.split(",").map((s) => s.trim()).filter(Boolean);
    if (statuses.length > 1) query = query.in("status", statuses);
    else query = query.eq("status", status);
  }

  const scope = getDeliveryScope(requester);
  if (scope.scope === "own") query = query.eq("owner_id", scope.user_id);
  else if (scope.scope === "team") query = query.eq("team_name", scope.team_name);

  if (ownerId && scope.scope !== "own") query = query.eq("owner_id", ownerId);
  if (team && scope.scope === "all") query = query.eq("team_name", team);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "출고 목록 조회 실패" }, { status: 500 });

  const deliveries = ((data ?? []) as Delivery[]).map((d) => ({
    ...d,
    car_price: Math.round(Number((d as any).car_price ?? 0)),
    ag_commission: Math.round(Number((d as any).ag_commission ?? 0)),
    etc_revenue: Math.round(Number((d as any).etc_revenue ?? 0)),
    customer_support: Math.round(Number((d as any).customer_support ?? 0)),
    dealer_commission:
      (d as any).dealer_commission == null ? null : Math.round(Number((d as any).dealer_commission ?? 0)),
  }));
  const withNames = await mapDeliveriesWithNames(deliveries);
  const summary = withNames.reduce(
    (acc, row) => {
      acc.total_count += 1;
      acc.total_ag_commission += Math.round(Number(row.ag_commission ?? 0));
      acc.total_dealer_commission += row.dealer_commission == null ? 0 : Math.round(Number(row.dealer_commission));
      acc.total_car_price += Math.round(Number(row.car_price ?? 0));
      return acc;
    },
    { total_count: 0, total_ag_commission: 0, total_dealer_commission: 0, total_car_price: 0 }
  );
  return NextResponse.json({ deliveries: withNames, total: withNames.length, summary });
}

export async function POST(req: Request) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const requester = auth.requester as Requester;

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  const input = parsed.data as DeliveryCreateInput;

  if (!input.delivery_date || !input.customer_name || !input.car_model) {
    return NextResponse.json({ error: "필수값이 누락되었습니다." }, { status: 400 });
  }
  if (input.delivery_type === "dealer" && !String(input.dealer_name ?? "").trim()) {
    return NextResponse.json({ error: "대리점 출고는 대리점명이 필수입니다." }, { status: 400 });
  }

  const { data: owner, error: ownerErr } = await supabaseAdmin
    .from("users")
    .select("id,team_name")
    .eq("id", input.owner_id)
    .maybeSingle();
  if (ownerErr || !owner) return NextResponse.json({ error: "담당자를 찾을 수 없습니다." }, { status: 400 });

  const ownerTeam = (owner as any).team_name == null ? null : String((owner as any).team_name);
  if (!canAssignOwner(requester, ownerTeam, input.owner_id)) {
    return NextResponse.json({ error: "해당 담당자로 등록할 권한이 없습니다." }, { status: 403 });
  }

  const template = await ensureOwnerTemplate(input.owner_id);
  if (!template) {
    return NextResponse.json({ error: "정산 대상자가 아닙니다. 요율 템플릿을 먼저 등록하세요." }, { status: 400 });
  }

  const row = toDeliveryRow(input);
  const payload = {
    ...row,
    owner_id: input.owner_id,
    created_by: requester.id,
    team_name: ownerTeam,
    status: "draft",
    version: 1,
    dealer_settlement_month: null,
    dealer_commission: null,
  };

  const { data: createdRaw, error: createErr } = await supabaseAdmin
    .from("settlement_deliveries")
    .insert(payload)
    .select("*")
    .single();
  if (createErr || !createdRaw) {
    return NextResponse.json({ error: "출고 건 등록에 실패했습니다." }, { status: 500 });
  }

  const created = createdRaw as Delivery;
  const warning = template.is_excluded ? "정산 제외 대상자에게 등록되었습니다." : undefined;
  await appendAuditForCreate(created, requester.id, warning);

  return NextResponse.json({ delivery: created, warning: warning ?? null });
}
