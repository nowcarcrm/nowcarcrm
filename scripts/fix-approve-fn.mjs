import fs from "fs";

const p = new URL("../app/api/attendance/leave-requests/[id]/approve/route.ts", import.meta.url);
let s = fs.readFileSync(p, "utf8");
const start = s.indexOf("function leaveTypeToAttendanceStatus");
const end = s.indexOf("async function syncAttendanceForApprovedLeave", start);
if (start < 0 || end < 0) process.exit(1);
const neu = `function leaveTypeToAttendanceStatus(requestType: string): string {
  if (requestType === "annual") return "연차";
  if (requestType === "half") return "반차";
  if (requestType === "sick") return "\uBCD1\uAC00";
  if (requestType === "field_work") return "\uC678\uADFC";
  return "\uD734\uAC00";
}

`;
s = s.slice(0, start) + neu + s.slice(end);
s = s.replace(
  /if \(remainingAnnualLeave < requestUsedAmount\)/,
  "if (requestUsedAmount > 0 && remainingAnnualLeave < requestUsedAmount)"
);
fs.writeFileSync(p, s, "utf8");
