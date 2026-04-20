import fs from "fs";

const s = fs.readFileSync(new URL("../app/(admin)/_lib/attendanceSupabase.ts", import.meta.url), "utf8");
const lines = s.split(/\r?\n/);
console.log(JSON.stringify(lines.slice(3, 12)));
