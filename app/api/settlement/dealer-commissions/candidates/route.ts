import { NextResponse } from "next/server";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { isSuperAdmin } from "@/app/(admin)/_lib/rolePermissions";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";

const TARGET_STATUSES = ["approved_director", "modilca_submitted", "confirmed"];

export async function GET(req: Request) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isSuperAdmin(auth.requester)) return NextResponse.json({ error: "총괄대표만 접근할 수 있습니다." }, { status: 403 });

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  let query = supabaseAdmin
    .from("settlement_deliveries")
    .select("id,customer_name,car_model,owner_id,car_price,delivery_date,dealer_commission,status,deleted_at")
    .is("deleted_at", null)
    .is("dealer_commission", null)
    .in("status", TARGET_STATUSES)
    .order("delivery_date", { ascending: false })
    .limit(100);
  if (q) query = query.or(`customer_name.ilike.%${q}%,car_model.ilike.%${q}%`);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "후보 조회 실패" }, { status: 500 });
  const ownerIds = Array.from(new Set((data ?? []).map((d: any) => String(d.owner_id ?? "")).filter(Boolean)));
  const { data: owners } = ownerIds.length
    ? await supabaseAdmin.from("users").select("id,name").in("id", ownerIds)
    : { data: [] as any[] };
  const ownerById = new Map((owners ?? []).map((o: any) => [String(o.id), String(o.name ?? "")]));
  const candidates = (data ?? []).map((d: any) => ({ ...d, owner_name: ownerById.get(String(d.owner_id ?? "")) ?? "" }));
  return NextResponse.json({ candidates });
}
