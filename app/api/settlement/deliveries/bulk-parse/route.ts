import { NextResponse } from "next/server";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { isSettlementManager } from "@/app/(admin)/_lib/settlement/permissions";
import { parseBulkWorkbook, validateBulkRows } from "../bulk-shared";
import type { Requester } from "../_lib";

export async function POST(req: Request) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isSettlementManager(auth.requester)) return NextResponse.json({ error: "팀장 이상만 접근할 수 있습니다." }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "파일이 필요합니다." }, { status: 400 });
  const lower = file.name.toLowerCase();
  if (!lower.endsWith(".xlsx") && !lower.endsWith(".csv")) {
    return NextResponse.json({ error: ".xlsx 또는 .csv 파일만 허용됩니다." }, { status: 400 });
  }

  const rawRows = parseBulkWorkbook(await file.arrayBuffer());
  const rows = await validateBulkRows(rawRows, auth.requester as Requester);
  const valid = rows.filter((r) => r.status === "valid").length;
  const invalid = rows.length - valid;
  return NextResponse.json({ total: rows.length, valid, invalid, rows });
}
