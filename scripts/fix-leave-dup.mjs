import fs from "fs";

const p = new URL("../app/api/attendance/leave-requests/route.ts", import.meta.url);
let s = fs.readFileSync(p, "utf8");
const anchor = '      .select("id,name,team_name,approval_status")';
const i = s.indexOf(anchor);
const j = s.indexOf("    const request = mapLeaveRow", i);
if (i < 0 || j < 0) {
  console.error("anchors", i, j);
  process.exit(1);
}
const fix = `      .select(
        "id,user_id,from_date,to_date,reason,status,approved_by,approved_at,rejected_by,rejected_at,rejection_reason,created_at,request_type,used_amount"
      )
      .single();

    if (error) throw new Error(error.message);

`;
s = s.slice(0, i) + fix + s.slice(j);
fs.writeFileSync(p, s, "utf8");
