import fs from "fs";

const p = new URL("../app/(admin)/_lib/attendanceSupabase.ts", import.meta.url);
const raw = fs.readFileSync(p, "utf8");
const lines = raw.split(/\r?\n/);

const ext = '| "' + "\uC678\uADFC" + '"';
const hyu = '| "' + "\uD734\uAC00" + '"';

const extIdx = lines.findIndex((l) => l.trim() === ext);
const hyuIdx = lines.findIndex((l, i) => i > extIdx && l.trim() === hyu);
if (extIdx === -1 || hyuIdx !== extIdx + 1) {
  console.error("type lines", extIdx, hyuIdx);
  process.exit(1);
}
const yeon = '| "' + "\uC5F0\uCC28" + '"';
if (lines[hyuIdx - 1]?.trim() === yeon.trim()) {
  console.log("types already extended");
} else {
  const ban = '| "' + "\uBC18\uCC28" + '"';
  const byeong = '| "' + "\uBCD1\uAC00" + '"';
  lines.splice(hyuIdx, 0, `  ${yeon}`, `  ${ban}`, `  ${byeong}`);
}

const start = lines.findIndex((l) => l.includes("const checkoutStatus = getCheckOutStatus"));
const end = lines.findIndex((l, i) => i > start && l.includes("const checkOutStamp"));
if (start === -1 || end === -1) {
  console.error("checkout", start, end);
  process.exit(1);
}

const hw = "\uD734\uBB34\uC77C \uADFC\uBB34";
const jogi = "\uC870\uAE30 \uD1F4\uADFC";
const jigak = "\uC9C0\uAC01";
const jeong = "\uC815\uC0C1 \uCD9C\uADFC";
const waU = "\uC678\uADFC";
const yeonU = "\uC5F0\uCC28";
const banU = "\uBC18\uCC28";
const byeongU = "\uBCD1\uAC00";

const replacement = [
  "  const checkoutStatus = getCheckOutStatus(now);",
  `  const preserved: AttendanceStatus[] = ["${waU}", "${yeonU}", "${banU}", "${byeongU}"];`,
  "  const nextStatus: AttendanceStatus =",
  `    current.status === "${hw}"`,
  `      ? "${hw}"`,
  `      : checkoutStatus === "${jogi}"`,
  `        ? "${jogi}"`,
  `        : current.checkin_status === "${jigak}"`,
  `          ? "${jigak}"`,
  "          : preserved.includes(current.status)",
  "            ? current.status",
  `            : "${jeong}";`,
];

if (lines[start + 1]?.includes("preserved")) {
  console.log("checkout already patched");
} else {
  lines.splice(start, end - start, ...replacement);
}

const out = raw.includes("\r\n") ? lines.join("\r\n") : lines.join("\n");
fs.writeFileSync(p, out, "utf8");
