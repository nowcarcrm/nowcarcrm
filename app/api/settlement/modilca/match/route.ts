import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { isSuperAdmin } from "@/app/(admin)/_lib/rolePermissions";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";
import { applyColumnMapping, type ColumnMapping } from "@/app/(admin)/_lib/settlement/modilcaParser";
import { logSettlementAudit } from "@/app/(admin)/_lib/settlement/auditLog";
import { matchModilcaRows } from "@/app/(admin)/_lib/settlement/modilcaMatcher";

const BodySchema = z.object({
  upload_id: z.string().uuid(),
  mapping: z.record(z.string(), z.string()),
  save_mapping_name: z.string().trim().min(1).max(100).optional(),
});

export async function POST(req: Request) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isSuperAdmin({ email: auth.requester.email, role: auth.requester.role, rank: auth.requester.rank })) {
    return NextResponse.json({ error: "총괄대표만 접근할 수 있습니다." }, { status: 403 });
  }
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });

  const { data: upload } = await supabaseAdmin
    .from("settlement_modilca_uploads")
    .select("id,parsed_rows")
    .eq("id", parsed.data.upload_id)
    .maybeSingle();
  if (!upload) return NextResponse.json({ error: "업로드 이력을 찾을 수 없습니다." }, { status: 404 });

  const rawRows = ((upload as any).parsed_rows ?? []) as Record<string, unknown>[];
  const mappedRows = applyColumnMapping(rawRows, parsed.data.mapping as ColumnMapping);
  const matchResults = await matchModilcaRows(mappedRows);
  const matchedCount = matchResults.filter((r) => r.matched).length;
  const unmatchedCount = matchResults.length - matchedCount;

  await supabaseAdmin
    .from("settlement_modilca_uploads")
    .update({
      status: "matching",
      matched_count: matchedCount,
      unmatched_count: unmatchedCount,
      notes: JSON.stringify({ match_results: matchResults }),
    })
    .eq("id", parsed.data.upload_id);

  if (parsed.data.save_mapping_name) {
    await supabaseAdmin.from("settlement_modilca_column_mappings").upsert(
      {
        name: parsed.data.save_mapping_name,
        mapping_json: parsed.data.mapping,
        updated_by: auth.requester.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "name" }
    );
  }

  await logSettlementAudit({
    action: "modilca_matched",
    entityType: "modilca_upload",
    entityId: parsed.data.upload_id,
    performedBy: auth.requester.id,
    details: { matched_count: matchedCount, unmatched_count: unmatchedCount },
  });

  return NextResponse.json({ upload_id: parsed.data.upload_id, match_results: matchResults });
}
