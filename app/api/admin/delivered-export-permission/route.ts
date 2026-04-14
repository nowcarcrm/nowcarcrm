import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseAuthVerifier } from "@/app/_lib/supabaseAdminServer";

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

function effectiveApproval(status: string | null | undefined): "pending" | "approved" | "rejected" {
  if (status === "pending" || status === "rejected" || status === "approved") return status;
  return "pending";
}

async function getRequesterRow(authUserId: string) {
  const { data: byId, error: e1 } = await supabaseAdmin
    .from("users")
    .select("id, role, approval_status")
    .eq("id", authUserId)
    .maybeSingle();
  if (e1) return { row: null, error: e1 };
  if (byId) return { row: byId, error: null };

  const { data: legacy, error: e2 } = await supabaseAdmin
    .from("users")
    .select("id, role, approval_status")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  return { row: legacy, error: e2 };
}

/** POST: verify approved admin before client generates delivered-customer Excel. */
export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: "missing_token" }, { status: 401 });
    }

    const { data: authData, error: authErr } = await supabaseAuthVerifier.auth.getUser(token);
    if (authErr || !authData.user) {
      return NextResponse.json({ error: "invalid_session" }, { status: 401 });
    }

    const { row: requester, error: requesterErr } = await getRequesterRow(authData.user.id);
    if (requesterErr || !requester) {
      return NextResponse.json({ error: "user_lookup_failed" }, { status: 403 });
    }
    if (effectiveApproval(requester.approval_status) !== "approved") {
      return NextResponse.json({ error: "not_approved" }, { status: 403 });
    }
    if (requester.role !== "admin") {
      return NextResponse.json({ error: "admin_only" }, { status: 403 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
