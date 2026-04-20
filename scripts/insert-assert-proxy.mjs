import fs from "fs";

const path = new URL("../app/api/attendance/leave-requests/route.ts", import.meta.url);
let s = fs.readFileSync(path, "utf8");
if (s.includes("assertProxyTarget")) {
  process.exit(0);
}

const team = "\uD300\uC7A5";
const bon = "\uBCF8\uBD80\uC7A5";
const dae = "\uB300\uD45C";
const chong = "\uCD1D\uAD04\uB300\uD45C";

const neu = `async function assertProxyTarget(requester: UserRow, targetUserId: string): Promise<string> {
  const { data: targetUser, error: targetErr } = await supabaseAdmin
    .from("users")
    .select("id,name,team_name,approval_status,rank")
    .eq("id", targetUserId)
    .maybeSingle();
  if (targetErr) throw new Error(targetErr.message);
  if (!targetUser || !isApproved(targetUser.approval_status)) {
    throw new Error("\uC694\uCCAD \uB300\uC0C1 \uC9C1\uC6D0\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  }
  const r = (requester.rank ?? "").trim();
  if (r === "${team}") {
    if ((targetUser.team_name ?? "") !== (requester.team_name ?? "")) {
      throw new Error("\uAC19\uC740 \uD300 \uC18C\uC18D \uC9C1\uC6D0\uB9CC \uB300\uC2E0 \uC694\uCCAD\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
    }
    return targetUser.id;
  }
  if (r === "${bon}") {
    if (isProtectedExecutiveUser({ rank: targetUser.rank ?? null, name: targetUser.name ?? null })) {
      throw new Error("\uD574\uB2F9 \uC9C1\uC6D0\uC5D0\uAC8C\uB294 \uB300\uC2E0 \uC694\uCCAD\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    }
    return targetUser.id;
  }
  if (r === "${dae}" || r === "${chong}") {
    return targetUser.id;
  }
  throw new Error("\uB300\uC2E0 \uC694\uCCAD \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.");
}

`;

const start = s.indexOf("function canProxySickLeaveByRank");
const end = s.indexOf("function thisYearRange()", start);
if (start === -1 || end === -1) {
  console.error("anchors not found", start, end);
  process.exit(1);
}
s = s.slice(0, start) + neu + s.slice(end);
fs.writeFileSync(path, s, "utf8");
