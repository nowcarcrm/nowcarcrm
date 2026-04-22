import { NextResponse } from "next/server";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { isSuperAdmin } from "@/app/(admin)/_lib/rolePermissions";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";
import { logSettlementAudit } from "@/app/(admin)/_lib/settlement/auditLog";
import { applyColumnMapping, parseModilcaExcel } from "@/app/(admin)/_lib/settlement/modilcaParser";

export async function POST(req: Request) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isSuperAdmin({ email: auth.requester.email, role: auth.requester.role, rank: auth.requester.rank })) {
    return NextResponse.json({ error: "총괄대표만 접근할 수 있습니다." }, { status: 403 });
  }
  const form = await req.formData();
  const file = form.get("file");
  const mappingId = String(form.get("mapping_id") ?? "").trim();
  if (!(file instanceof File)) return NextResponse.json({ error: "파일이 필요합니다." }, { status: 400 });
  if (!file.name.toLowerCase().endsWith(".xlsx")) return NextResponse.json({ error: ".xlsx 파일만 허용됩니다." }, { status: 400 });

  const rows = parseModilcaExcel(await file.arrayBuffer());
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const { data: uploadRow, error: uploadErr } = await supabaseAdmin
    .from("settlement_modilca_uploads")
    .insert({
      file_name: file.name,
      uploaded_by: auth.requester.id,
      parsed_rows: rows,
      status: "pending",
    })
    .select("id")
    .maybeSingle();
  if (uploadErr || !uploadRow) return NextResponse.json({ error: "업로드 로그 저장 실패" }, { status: 500 });

  const { data: savedMappings } = await supabaseAdmin
    .from("settlement_modilca_column_mappings")
    .select("id,name,mapping_json")
    .order("updated_at", { ascending: false })
    .limit(20);

  let parsedRows: ReturnType<typeof applyColumnMapping> | undefined;
  if (mappingId) {
    const target = (savedMappings ?? []).find((m: any) => String(m.id) === mappingId);
    if (target?.mapping_json) parsedRows = applyColumnMapping(rows, target.mapping_json as Record<string, string>);
  }

  await logSettlementAudit({
    action: "modilca_uploaded",
    entityType: "modilca_upload",
    entityId: String(uploadRow.id),
    performedBy: auth.requester.id,
    details: { file_name: file.name, total_rows: rows.length },
  });

  return NextResponse.json({
    upload_id: uploadRow.id,
    raw_headers: headers,
    sample_rows: rows.slice(0, 5),
    total_rows: rows.length,
    saved_mappings: (savedMappings ?? []).map((m: any) => ({ id: m.id, name: m.name })),
    parsed_rows: parsedRows,
  });
}
