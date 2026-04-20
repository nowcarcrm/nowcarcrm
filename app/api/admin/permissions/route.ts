import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/app/(admin)/_lib/rolePermissions";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";

const FIELDS = ["can_read", "can_create", "can_update", "can_delete"] as const;
type PermField = (typeof FIELDS)[number];

export async function GET(req: Request) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!isSuperAdmin({ email: auth.requester.email, role: auth.requester.role, rank: auth.requester.rank })) {
    return NextResponse.json({ error: "총괄대표만 접근할 수 있습니다." }, { status: 403 });
  }
  const { data, error } = await supabaseAdmin
    .from("permissions")
    .select("id, role, resource, can_read, can_create, can_update, can_delete, updated_at")
    .order("resource", { ascending: true })
    .order("role", { ascending: true });
  if (error) {
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }
  return NextResponse.json({ rows: data ?? [] });
}

type UpdateRow = { role: string; resource: string; field: PermField; value: boolean };

export async function PUT(req: Request) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!isSuperAdmin({ email: auth.requester.email, role: auth.requester.role, rank: auth.requester.rank })) {
    return NextResponse.json({ error: "총괄대표만 접근할 수 있습니다." }, { status: 403 });
  }
  let body: { updates?: UpdateRow[] };
  try {
    body = (await req.json()) as { updates?: UpdateRow[] };
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const updates = Array.isArray(body.updates) ? body.updates : [];
  if (updates.length === 0) {
    return NextResponse.json({ ok: true, changed: 0 });
  }
  let changed = 0;
  for (const u of updates) {
    if (!FIELDS.includes(u.field)) continue;
    const role = (u.role ?? "").trim().slice(0, 32);
    const resource = (u.resource ?? "").trim().slice(0, 64);
    if (!role || !resource) continue;
    const { data: cur, error: selErr } = await supabaseAdmin
      .from("permissions")
      .select("id, can_read, can_create, can_update, can_delete")
      .eq("role", role)
      .eq("resource", resource)
      .maybeSingle();
    if (selErr || !cur) continue;
    const row = cur as Record<string, boolean | string> & { id: string };
    const oldVal = !!row[u.field];
    if (oldVal === !!u.value) continue;
    const patch: Record<string, boolean | string> = { [u.field]: !!u.value, updated_at: new Date().toISOString() };
    const { error: upErr } = await supabaseAdmin.from("permissions").update(patch).eq("id", row.id);
    if (upErr) continue;
    await supabaseAdmin.from("permission_change_logs").insert({
      changed_by: auth.requester.id,
      role,
      resource,
      field: u.field,
      old_value: oldVal,
      new_value: !!u.value,
    });
    changed += 1;
  }
  return NextResponse.json({ ok: true, changed });
}
