import fs from "fs";

const path = new URL("../app/api/attendance/leave-requests/route.ts", import.meta.url);
let s = fs.readFileSync(path, "utf8");

const start = s.indexOf("    const requestType: LeaveRequestType =");
const sel = s.indexOf("      .select(", start);
if (start === -1 || sel === -1) {
  console.error("anchors", start, sel);
  process.exit(1);
}
const blockEnd = s.lastIndexOf("      })", sel);
if (blockEnd === -1) {
  console.error("blockEnd");
  process.exit(1);
}
const insertEnd = blockEnd + "      })".length;

const msgProxy = "\uB300\uC2E0 \uC694\uCCAD\uC740 \uD300\uC7A5\u00B7\uBCF8\uBD80\uC7A5\u00B7\uB300\uD45C\u00B7\uCD1D\uAD04\uB300\uD45C\uB9CC \uAC00\uB2A5\uD569\uB2C8\uB2E4.";
const msgFail = "\uC694\uCCAD \uB300\uC0C1\uC744 \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.";
const msgLeave = "\uC794\uC5EC \uC5F0\uCC28\uAC00 \uBD80\uC871\uD569\uB2C8\uB2E4.";
const msgDateOrder = "\uC885\uB8CC\uC77C\uC740 \uC2DC\uC791\uC77C\uBCF4\uB2E4 \uBE60\uB97C \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.";

const newBlock = `    let requestType: LeaveRequestType = "annual";
    if (body.requestType === "half") requestType = "half";
    else if (body.requestType === "sick") requestType = "sick";
    else if (body.requestType === "field_work") requestType = "field_work";

    const rawTarget = (body.targetUserId ?? "").trim();
    const isProxyRequest = rawTarget.length > 0 && rawTarget !== requester.id;

    const usedAmount =
      requestType === "half" ? 0.5 : requestType === "sick" || requestType === "field_work" ? 0 : 1;

    if (isProxyRequest && !canProxyLeaveRequestByRank(requester.rank)) {
      return NextResponse.json({ error: "${msgProxy}" }, { status: 403 });
    }

    if (!fromDate || !toDate) {
      return NextResponse.json({ error: "\uC2DC\uC791\uC77C\uACFC \uC885\uB8CC\uC77C\uC740 \uD544\uC218\uC785\uB2C8\uB2E4." }, { status: 400 });
    }
    if (toDate < fromDate) {
      return NextResponse.json({ error: "${msgDateOrder}" }, { status: 400 });
    }

    let requestTargetUserId = requester.id;
    if (isProxyRequest) {
      try {
        requestTargetUserId = await assertProxyTarget(requester, rawTarget);
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : "${msgFail}" },
          { status: 400 }
        );
      }
    }

    const { data: targetLeaveUser, error: targetLeaveUserErr } = await supabaseAdmin
      .from("users")
      .select("id,remaining_annual_leave")
      .eq("id", requestTargetUserId)
      .maybeSingle();
    if (targetLeaveUserErr) throw new Error(targetLeaveUserErr.message);
    const remainingAnnualLeave = Number(targetLeaveUser?.remaining_annual_leave ?? ANNUAL_LEAVE_QUOTA);
    if (usedAmount > 0 && remainingAnnualLeave < usedAmount) {
      return NextResponse.json({ error: "${msgLeave}" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("leave_requests")
      .insert({
        user_id: requestTargetUserId,
        from_date: fromDate,
        to_date: toDate,
        reason: reason || null,
        status: "pending",
        request_type: requestType,
        used_amount: usedAmount,
        requested_by: isProxyRequest ? requester.id : null,
      })`;

s = s.slice(0, start) + newBlock + s.slice(insertEnd);

s = s.replace(
 /        else if \(row\.request_type === "field_work"\) \{[\s\S]*?\} else current\.annual \+= 1;/,
  `        else if (row.request_type === "field_work") {
          /* field_work: no annual quota; omit from annual/half/sick counts */
        } else current.annual += 1;`
);

fs.writeFileSync(path, s, "utf8");
