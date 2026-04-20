import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseAuthVerifier } from "@/app/_lib/supabaseAdminServer";
import { canPatchAttendanceStatusByRank } from "@/app/(admin)/_lib/rolePermissions";

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

type PatchStatus = "normal" | "late" | "annual_leave" | "half_day" | "sick_leave" | "field_work";

/** DB/UI status strings (matches attendance page & spec) */
function toAttendanceStatus(patch: PatchStatus): string {
  if (patch === "field_work") return "\uC678\uADFC";
  if (patch === "normal") return "\uC815\uC0C1 \uCD9C\uADFC";
  if (patch === "late") return "\uC9C0\uAC01";
  if (patch === "annual_leave") return "\uC5F0\uCC28";
  if (patch === "half_day") return "\uBC18\uCC28";
  return "\uBCD1\uAC00";
}

function isWeekendDateKey(day: string): boolean {
  const d = new Date(`${day}T12:00:00`);
  const w = d.getDay();
  return w === 0 || w === 6;
}

async function getRequester(authUserId: string) {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id,rank,approval_status")
    .eq("id", authUserId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return data;
  const { data: legacy, error: legacyErr } = await supabaseAdmin
    .from("users")
    .select("id,rank,approval_status")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (legacyErr) throw new Error(legacyErr.message);
  return legacy;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: "\uC778\uC99D \uD1A0\uD070\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." }, { status: 401 });
    }

    const { data: authData, error: authErr } = await supabaseAuthVerifier.auth.getUser(token);
    if (authErr || !authData.user) {
      return NextResponse.json({ error: "\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uC778\uC99D\uC785\uB2C8\uB2E4." }, { status: 401 });
    }

    const requester = await getRequester(authData.user.id);
    if (!requester || requester.approval_status !== "approved") {
      return NextResponse.json(
        { error: "\uC2B9\uC778\uB41C \uC0AC\uC6A9\uC790\uB9CC \uCC98\uB9AC\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." },
        { status: 403 }
      );
    }
    if (!canPatchAttendanceStatusByRank(requester.rank)) {
      return NextResponse.json(
        {
          error:
            "\uBCF8\uBD80\uC7A5 \uC774\uC0C1\uB9CC \uADFC\uD0DC\uAC12\uC744 \uBCC0\uACBD\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
        },
        { status: 403 }
      );
    }

    const { id } = await params;
    if (!id?.trim()) {
      return NextResponse.json({ error: "\uADFC\uD0DC ID\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4." }, { status: 400 });
    }

    const body = (await req.json()) as { status?: string; userId?: string; date?: string };
    const raw = body.status;
    const allowed: PatchStatus[] = ["normal", "late", "annual_leave", "half_day", "sick_leave", "field_work"];
    if (!raw || !allowed.includes(raw as PatchStatus)) {
      return NextResponse.json(
        {
          error:
            "status\uB294 normal | late | annual_leave | half_day | sick_leave | field_work \uC911 \uD558\uB098\uC5EC\uC57C \uD569\uB2C8\uB2E4.",
        },
        { status: 400 }
      );
    }
    const patchStatus = raw as PatchStatus;
    const nextStatus = toAttendanceStatus(patchStatus);

    let attendanceId = id;
    let prev: string | null = null;
    if (id.startsWith("virtual:")) {
      const userId = (body.userId ?? "").trim();
      const date = (body.date ?? "").trim();
      if (!userId || !date) {
        return NextResponse.json({ error: "\uAC00\uC0C1 \uD589 \uC218\uC815\uC5D0\uB294 userId/date\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4." }, { status: 400 });
      }
      const insertBody: Record<string, unknown> = {
        user_id: userId,
        date,
        work_date: date,
        status: nextStatus,
        is_holiday: false,
        is_weekend: isWeekendDateKey(date),
      };
      if (patchStatus === "late") insertBody.checkin_status = "\uC9C0\uAC01";
      const { data: inserted, error: insErr } = await supabaseAdmin
        .from("attendance")
        .insert(insertBody)
        .select("id")
        .single();
      if (insErr) throw new Error(insErr.message);
      attendanceId = String((inserted as { id: string }).id);
    } else {
      const { data: row, error: rowErr } = await supabaseAdmin
        .from("attendance")
        .select("id,status")
        .eq("id", id)
        .maybeSingle();
      if (rowErr) throw new Error(rowErr.message);
      if (!row) {
        return NextResponse.json(
          { error: "\uADFC\uD0DC\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." },
          { status: 404 }
        );
      }
      prev = (row as { status?: string | null }).status ?? null;
      const latePatch =
        patchStatus === "late"
          ? { status: nextStatus, checkin_status: "\uC9C0\uAC01" as const }
          : { status: nextStatus };
      const { error: updErr } = await supabaseAdmin.from("attendance").update(latePatch).eq("id", id);
      if (updErr) throw new Error(updErr.message);
    }

    const { error: logErr } = await supabaseAdmin.from("attendance_status_changes").insert({
      attendance_id: attendanceId,
      changed_by: requester.id,
      previous_status: prev,
      new_status: nextStatus,
    });
    if (logErr) throw new Error(logErr.message);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "\uADFC\uD0DC \uBCC0\uACBD \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.",
      },
      { status: 500 }
    );
  }
}
