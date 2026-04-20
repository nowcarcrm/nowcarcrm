import fs from "fs";

const path = new URL("../app/api/attendance/leave-requests/route.ts", import.meta.url);
let s = fs.readFileSync(path, "utf8");
if (s.includes("canProxyLeaveRequestByRank")) {
  process.exit(0);
}
const importLine = 'import { supabaseAdmin, supabaseAuthVerifier } from "@/app/_lib/supabaseAdminServer";';
const newImports = `${importLine}
import { canProxyLeaveRequestByRank } from "@/app/(admin)/_lib/rolePermissions";
import { isProtectedExecutiveUser } from "@/app/(admin)/_lib/screenScopes";`;
if (!s.includes(importLine)) {
  console.error("import anchor missing");
  process.exit(1);
}
s = s.replace(importLine, newImports);

s = s.replace(
  'type LeaveRequestType = "annual" | "half" | "sick";',
  'type LeaveRequestType = "annual" | "half" | "sick" | "field_work";'
);

s = s.replace(
  /function canProxySickLeaveByRank[\s\S]*?^}/m,
  `async function assertProxyTarget(requester: UserRow, targetUserId: string) {
  const { data: targetUser, error: targetErr } = await supabaseAdmin
    .from("users")
    .select("id,name,team_name,approval_status,rank")
    .eq("id", targetUserId)
    .maybeSingle();
  if (targetErr) throw new Error(targetErr.message);
  if (!targetUser || !isApproved(targetUser.approval_status)) {
    throw new Error("요�을 수 없습니다.");
  }
  const r = (requester.rank ?? "").trim();
  if (r === "${"\uD300\uC7A5"}") {
    if ((targetUser.team_name ?? "") !== (requester.team_name ?? "")) {
      throw�은 ��� 소속 ��원만 대신 요청할 수 있습니다.");
    }
    return targetUser.id as string;
  }
  if (r === "${"\uBCF8\uBD80\uC7A5"}") {
    if (isProtectedExecutiveUser({ rank: targetUser.rank ?? null, name: targetUser.name ?? null })) {
      throw new Error("해당 ��원에게는 대신 요청할 수 없습니다.");
    }
    return targetUser.id as string;
  }
  if (r === "${"\uB300\uD45C"}" || r === "${"\uCD1D\uAD04\uB300\uD45C"}") {
    return targetUser.id as string;
  }
  throw new Error("대��한이 없습니다.");
}`
);

// Fix template - the above is wrong - we need actual team rank in string
const team = "\uD300\uC7A5";
const bon = "\uBCF8\uBD80\uC7A5";
const dae = "\uB300\uD45C";
const chong = "\uCD1D\uAD04\uB300\uD45C";

const assertFn = `async function assertProxyTarget(requester: UserRow, targetUserId: string) {
  const { data: targetUser, error: targetErr } = await supabaseAdmin
    .from("users")
    .select("id,name,team_name,approval_status,rank")
    .eq("id", targetUserId)
    .maybeSingle();
  if (targetErr) throw new Error(targetErr.message);
  if (!targetUser || !isApproved(targetUser.approval_status)) {
    throw new Error("요청 대상 ��원을 ��을 수 없습니다.");
  }
  const r = (requester.rank ?? "").trim();
  if (r === "${team}") {
    if ((targetUser.team_name ?? "") !== (requester.team_name ?? "")) {
      throw new Error("�원만 대신 요청할 수 있습니다.");
    }
    return targetUser.id as string;
  }
  if (r === "${bon}") {
    if (isProtectedExecutiveUser({ rank: targetUser.rank ?? null, name: targetUser.name ?? null })) {
      throw new Error("해당 ��원에게는 대신 요청할 수 없습니다.");
    }
    return targetUser.id as string;
  }
  if (r === "${dae}" || r === "${chong}") {
    return targetUser.id as string;
  }
  throw new Error("대신 요청 ���한이 없습니다.");
}`;

// Re-read - the replace broke - simpler: read file freshs = fs.readFileSync(path, "utf8");
s = s.replace(importLine, newImports);
s = s.replace(
  'type LeaveRequestType = "annual" | "half" | "sick";',
  'type LeaveRequestType = "annual" | "half" | "sick" | "field_work";'
);

const oldProxy = `function canProxySickLeaveByRank(rank: string | null | undefined): boolean {
  return��장";
}`;
if (!s.includes(oldProxy)) {
  console.error("canProxySickLeaveByRank block not found");
  process.exit(1);
}
s = s.replace(oldProxy, assertFn);

fs.writeFileSync(path, s, "utf8");
