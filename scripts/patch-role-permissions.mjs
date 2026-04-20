import fs from "fs";

const path = new URL("../app/(admin)/_lib/rolePermissions.ts", import.meta.url);
let s = fs.readFileSync(path, "utf8");
if (s.includes("canPatchAttendanceStatusByRank")) {
  process.exit(0);
}
const needle = "export function isTeamLeader(user: MaybeUserLike | null | undefined): boolean {";
const bon = "\uBCF8\uBD80\uC7A5";
const dae = "\uB300\uD45C";
const chong = "\uCD1D\uAD04\uB300\uD45C";
const team = "\uD300\uC7A5";
const insert = `export function canPatchAttendanceStatusByRank(rank: string | null | undefined): boolean {
  const r = (rank ?? "").trim();
  return r === "${bon}" || r === "${dae}" || r === "${chong}";
}

export function canProxyLeaveRequestByRank(rank: string | null | undefined): boolean {
  const r = (rank ?? "").trim();
  return r === "${team}" || r === "${bon}" || r === "${dae}" || r === "${chong}";
}

`;
if (!s.includes(needle)) {
  console.error("needle not found");
  process.exit(1);
}
s = s.replace(needle, insert + needle);
fs.writeFileSync(path, s, "utf8");
