/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";
import {
  canDeleteDelivery,
  canEditDelivery,
  canReadDelivery,
  getChangedFields,
  mapDeliveriesWithNames,
  toDeliveryRow,
  type Requester,
} from "../_lib";
import { logSettlementAudit } from "@/app/(admin)/_lib/settlement/auditLog";
import { triggerReportRecompute } from "@/app/(admin)/_lib/settlement/reportTrigger";
import { isSuperAdmin } from "@/app/(admin)/_lib/rolePermissions";
import type { Delivery, DeliveryUpdateInput } from "@/app/(admin)/_types/settlement";

const patchSchema = z.object({
  version: z.number().int().min(1),
  lead_id: z.number().int().positive().nullable().optional(),
  financial_company: z.string().trim().min(1).max(100).optional(),
  product_type: z.enum(["rent", "lease"]).optional(),
  contract_date: z.string().trim().nullable().optional(),
  delivery_date: z.string().trim().optional(),
  registration_date: z.string().trim().nullable().optional(),
  customer_name: z.string().trim().min(1).max(100).optional(),
  car_model: z.string().trim().min(1).max(100).optional(),
  car_price: z.number().min(0).optional(),
  ag_commission: z.number().min(0).optional(),
  etc_revenue: z.number().min(0).optional(),
  customer_support: z.number().min(0).optional(),
  delivery_type: z.enum(["special", "dealer"]).optional(),
  dealer_name: z.string().trim().nullable().optional(),
  dealer_contract_no: z.string().trim().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
});

async function fetchDelivery(id: string): Promise<Delivery | null> {
  const { data } = await supabaseAdmin.from("settlement_deliveries").select("*").eq("id", id).maybeSingle();
  return (data as Delivery | null) ?? null;
}

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getRequesterFromToken(_req);
  if (!auth.requester) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const requester = auth.requester as Requester;
  const { id } = await context.params;

  const row = await fetchDelivery(id);
  if (!row) return NextResponse.json({ error: "출고 건을 찾을 수 없습니다." }, { status: 404 });
  if (row.deleted_at && !isSuperAdmin(requester)) {
    return NextResponse.json({ error: "삭제된 출고 건입니다." }, { status: 404 });
  }
  if (!canReadDelivery(requester, row)) {
    return NextResponse.json({ error: "조회 권한이 없습니다." }, { status: 403 });
  }
  const withNames = await mapDeliveriesWithNames([row]);
  return NextResponse.json({ delivery: withNames[0] });
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const requester = auth.requester as Requester;
  const { id } = await context.params;

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  const input = parsed.data as DeliveryUpdateInput;

  const before = await fetchDelivery(id);
  if (!before) return NextResponse.json({ error: "출고 건을 찾을 수 없습니다." }, { status: 404 });
  if (before.deleted_at) return NextResponse.json({ error: "삭제된 출고 건은 수정할 수 없습니다." }, { status: 400 });
  if (!canEditDelivery(requester, before)) return NextResponse.json({ error: "수정 권한이 없습니다." }, { status: 403 });
  if (before.version !== input.version) {
    return NextResponse.json({ error: "다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 시도하세요." }, { status: 409 });
  }

  if (input.delivery_type === "dealer" && !String(input.dealer_name ?? before.dealer_name ?? "").trim()) {
    return NextResponse.json({ error: "대리점 출고는 대리점명이 필수입니다." }, { status: 400 });
  }

  const rowPatch = toDeliveryRow({
    ...before,
    ...input,
    owner_id: before.owner_id,
  } as any);

  const patch: Record<string, unknown> = {
    ...rowPatch,
    version: before.version + 1,
    updated_at: new Date().toISOString(),
  };

  // owner/status 변경은 Phase 3에서 금지
  delete patch.owner_id;
  delete patch.status;
  delete patch.created_by;
  delete patch.team_name;
  delete patch.dealer_commission;
  delete patch.dealer_settlement_month;
  delete patch.lead_id;

  const { data: updatedRaw, error: updateErr } = await supabaseAdmin
    .from("settlement_deliveries")
    .update(patch)
    .eq("id", id)
    .eq("version", before.version)
    .select("*")
    .single();
  if (updateErr || !updatedRaw) return NextResponse.json({ error: "수정에 실패했습니다." }, { status: 500 });

  const after = updatedRaw as Delivery;
  const changedFields = getChangedFields(before as any, after as any);
  await logSettlementAudit({
    action: "delivery_updated",
    entityType: "delivery",
    entityId: after.id,
    targetUserId: after.owner_id,
    performedBy: requester.id,
    details: {
      before,
      after,
      changed_fields: changedFields,
    },
  });

  if (["approved_director", "modilca_submitted", "confirmed"].includes(after.status)) {
    void triggerReportRecompute({
      deliveryId: after.id,
      ownerId: after.owner_id,
      agMonth: after.ag_settlement_month,
      dealerMonth: after.dealer_settlement_month,
      performedBy: requester.id,
    }).catch((e) => {
      console.error("[REPORT RECOMPUTE FAIL]", e);
    });
  }

  return NextResponse.json({ delivery: after });
}

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const requester = auth.requester as Requester;
  const { id } = await context.params;

  const before = await fetchDelivery(id);
  if (!before) return NextResponse.json({ error: "출고 건을 찾을 수 없습니다." }, { status: 404 });
  if (before.deleted_at) return NextResponse.json({ success: true });
  if (!canDeleteDelivery(requester, before)) {
    return NextResponse.json({ error: "삭제 권한이 없습니다." }, { status: 403 });
  }

  const { data: deletedRaw, error } = await supabaseAdmin
    .from("settlement_deliveries")
    .update({
      deleted_at: new Date().toISOString(),
      version: before.version + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !deletedRaw) return NextResponse.json({ error: "삭제에 실패했습니다." }, { status: 500 });

  await logSettlementAudit({
    action: "delivery_deleted",
    entityType: "delivery",
    entityId: before.id,
    targetUserId: before.owner_id,
    performedBy: requester.id,
    details: {
      status: before.status,
      owner_id: before.owner_id,
      team_name: before.team_name,
    },
  });

  return NextResponse.json({ success: true });
}
