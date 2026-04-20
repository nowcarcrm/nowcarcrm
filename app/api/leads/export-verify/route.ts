import { NextResponse } from "next/server";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { getClientIpFromHeaders } from "@/app/_lib/requestClientMeta";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";
import { filterLeadIdsForExport } from "../_lib/filterLeadExportIds";

type Body = {
  leadIds: string[];
  exportType?: string;
  fileName?: string;
};

export async function POST(req: Request) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const leadIds = Array.isArray(body.leadIds) ? body.leadIds : [];
  const exportType = (body.exportType ?? "leads").slice(0, 32) || "leads";
  const fileName = (body.fileName ?? "").slice(0, 512) || null;
  const allowed = await filterLeadIdsForExport(
    {
      id: auth.requester.id,
      role: auth.requester.role,
      rank: auth.requester.rank ?? null,
      email: auth.requester.email ?? null,
      team_name: auth.requester.team_name ?? null,
    },
    leadIds
  );
  const requested = [...new Set(leadIds.map((id) => String(id).trim()).filter(Boolean))];
  if (allowed.length !== requested.length) {
    return NextResponse.json(
      {
        error: "보내기 권한이 없는 고객이 포함되어 있습니다. 범위를 확인해 주세요.",
        allowedCount: allowed.length,
        requestedCount: requested.length,
      },
      { status: 403 }
    );
  }
  const ip = getClientIpFromHeaders(req.headers);
  await supabaseAdmin.from("export_logs").insert({
    user_id: auth.requester.id,
    export_type: exportType,
    exported_count: allowed.length,
    file_name: fileName,
    ip_address: ip,
  });
  return NextResponse.json({ ok: true, exportedCount: allowed.length });
}
