import { NextResponse } from "next/server";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { isSuperAdmin } from "@/app/(admin)/_lib/rolePermissions";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";
import { generateModilcaSubmissionExcel } from "@/app/(admin)/_lib/settlement/excelExporter";
import type { DeliveryWithNames } from "@/app/(admin)/_types/settlement";

type UserRow = { id: string; name: string | null; email: string | null };

export async function GET(req: Request) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isSuperAdmin(auth.requester)) return NextResponse.json({ error: "총괄대표만 접근할 수 있습니다." }, { status: 403 });

  const month = (new URL(req.url).searchParams.get("month") ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: "month 형식이 올바르지 않습니다." }, { status: 400 });

  const { data: raw, error } = await supabaseAdmin
    .from("settlement_deliveries")
    .select("*")
    .eq("ag_settlement_month", month)
    .eq("status", "approved_director")
    .is("deleted_at", null)
    .order("delivery_date", { ascending: true });
  if (error) return NextResponse.json({ error: "출고 내역 조회 실패" }, { status: 500 });

  const ownerIds = Array.from(new Set((raw ?? []).map((d) => String((d as { owner_id?: string }).owner_id ?? "")).filter(Boolean)));
  const { data: owners } = ownerIds.length
    ? await supabaseAdmin.from("users").select("id,name,email").in("id", ownerIds)
    : { data: [] as UserRow[] };
  const ownerById = new Map((owners ?? []).map((u) => [String((u as UserRow).id), u as UserRow]));

  const deliveries: DeliveryWithNames[] = (raw ?? []).map((d) => {
    const owner = ownerById.get(String((d as { owner_id?: string }).owner_id ?? ""));
    return {
      ...(d as DeliveryWithNames),
      owner_name: String(owner?.name ?? ""),
      owner_email: String(owner?.email ?? ""),
      created_by_name: "",
    };
  });

  const buffer = generateModilcaSubmissionExcel(deliveries, month);
  const fileName = `모딜카제출_${month}.xlsx`;
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "no-store",
    },
  });
}
