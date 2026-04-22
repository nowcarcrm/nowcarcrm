/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { isSuperAdmin } from "@/app/(admin)/_lib/rolePermissions";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";
import { parseDealerExcel, parseImageWithVision } from "@/app/(admin)/_lib/settlement/dealerAI";
import { matchDealerRows } from "@/app/(admin)/_lib/settlement/dealerMatcher";
import { logSettlementAudit } from "@/app/(admin)/_lib/settlement/auditLog";

export async function POST(req: Request) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isSuperAdmin({ email: auth.requester.email, role: auth.requester.role, rank: auth.requester.rank })) {
    return NextResponse.json({ error: "총괄대표만 접근할 수 있습니다." }, { status: 403 });
  }
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "파일이 필요합니다." }, { status: 400 });

  const lower = file.name.toLowerCase();
  const isImage = lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png");
  const isExcel = lower.endsWith(".xlsx") || lower.endsWith(".xls");
  if (!isImage && !isExcel) return NextResponse.json({ error: "xlsx/xls/jpg/jpeg/png 파일만 허용됩니다." }, { status: 400 });

  const buffer = await file.arrayBuffer();
  const parsedRows = isImage
    ? await parseImageWithVision(Buffer.from(buffer).toString("base64"), file.type || "image/jpeg")
    : await parseDealerExcel(buffer);
  const matchResults = await matchDealerRows(parsedRows);
  const matchedCount = matchResults.filter((r) => r.match_tier > 0).length;
  const unmatchedCount = matchResults.length - matchedCount;

  const { data: upload, error: uploadErr } = await supabaseAdmin
    .from("settlement_dealer_uploads")
    .insert({
      file_name: file.name,
      file_type: isImage ? "image" : "excel",
      source: isImage ? "image" : "excel",
      uploaded_by: auth.requester.id,
      ai_parsed_data: parsedRows,
      matched_count: matchedCount,
      unmatched_count: unmatchedCount,
      status: "matching",
    })
    .select("id")
    .maybeSingle();
  if (uploadErr || !upload) return NextResponse.json({ error: "업로드 로그 저장 실패" }, { status: 500 });

  await logSettlementAudit({
    action: "dealer_commission_parsed",
    entityType: "dealer_upload",
    entityId: String((upload as any).id),
    performedBy: auth.requester.id,
    details: { file_name: file.name, matched_count: matchedCount, unmatched_count: unmatchedCount },
  });

  return NextResponse.json({
    upload_id: (upload as any).id,
    parsed_rows: parsedRows,
    match_results: matchResults,
  });
}
