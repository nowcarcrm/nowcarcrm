import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { isSettlementManager } from "@/app/(admin)/_lib/settlement/permissions";
import { logSettlementAudit } from "@/app/(admin)/_lib/settlement/auditLog";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";
import { appendAuditForCreate, canAssignOwner, type Requester } from "../_lib";
import { prepareInsertPayload } from "../bulk-shared";

const RowSchema = z.object({
  row_index: z.number().int().positive(),
  owner_id: z.string().uuid(),
  owner_name: z.string(),
  owner_email: z.string(),
  team_name: z.string().nullable(),
  contract_date: z.string().nullable(),
  delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  registration_date: z.string().nullable(),
  customer_name: z.string().min(1),
  car_model: z.string().min(1),
  car_price: z.number().min(0),
  financial_company: z.string().min(1),
  product_type: z.enum(["rent", "lease"]),
  delivery_type: z.enum(["special", "dealer"]),
  dealer_name: z.string().nullable(),
  dealer_contract_no: z.string().nullable(),
  ag_commission: z.number().min(0),
  customer_support: z.number().min(0),
  etc_revenue: z.number().min(0),
  notes: z.string().nullable(),
});
const BodySchema = z.object({ rows: z.array(RowSchema) });

export async function POST(req: Request) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isSettlementManager(auth.requester)) return NextResponse.json({ error: "팀장 이상만 접근할 수 있습니다." }, { status: 403 });
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });

  const requester = auth.requester as Requester;
  let created = 0;
  const failed: Array<{ row_index: number; error: string }> = [];
  for (const row of parsed.data.rows) {
    try {
      if (!canAssignOwner(requester, row.team_name, row.owner_id)) {
        failed.push({ row_index: row.row_index, error: "권한으로 해당 담당자 등록 불가" });
        continue;
      }
      const { payload, warning } = await prepareInsertPayload(row, requester.id);
      const { data: createdRaw, error } = await supabaseAdmin.from("settlement_deliveries").insert(payload).select("*").single();
      if (error || !createdRaw) {
        failed.push({ row_index: row.row_index, error: error?.message ?? "등록 실패" });
        continue;
      }
      created += 1;
      await appendAuditForCreate(createdRaw, requester.id, warning);
    } catch (e) {
      failed.push({ row_index: row.row_index, error: e instanceof Error ? e.message : "등록 실패" });
    }
  }

  await logSettlementAudit({
    action: "delivery_bulk_created",
    entityType: "delivery",
    performedBy: requester.id,
    details: { count: created, failed_count: failed.length },
  });
  return NextResponse.json({ created, failed });
}
