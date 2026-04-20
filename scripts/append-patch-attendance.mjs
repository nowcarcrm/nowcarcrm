import fs from "fs";

const p = new URL("../app/(admin)/_lib/leaveRequestService.ts", import.meta.url);
let s = fs.readFileSync(p, "utf8");
if (s.includes("patchAttendanceRecordStatus")) {
  process.exit(0);
}
const add = `

export type AttendancePatchStatus =
  | "normal"
  | "annual_leave"
  | "half_day"
  | "sick_leave"
  | "field_work";

export async function patchAttendanceRecordStatus(attendanceId: string, status: AttendancePatchStatus): Promise<void> {
  const token = await getAccessToken();
  const res = await fetch(\`/api/attendance/\${attendanceId}/status\`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: \`Bearer \${token}\`,
    },
    body: JSON.stringify({ status }),
  });
  const json = (await res.json()) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "\uADFC\uD0DC \uC0C1\uD0DC \uBCC0\uACBD\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
}
`;
fs.writeFileSync(p, s + add, "utf8");
