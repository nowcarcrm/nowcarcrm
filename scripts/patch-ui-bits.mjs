import fs from "fs";

const modalPath = new URL("../app/(admin)/attendance/_components/LeaveRequestModal.tsx", import.meta.url);
let modal = fs.readFileSync(modalPath, "utf8");
modal = modal.replace(
  /const title =\s*\n\s*props\.requestType === "half" \? "[^"]+" : props\.requestType === "sick" \? "[^"]+" : "[^"]+";/,
  `const title =
    props.requestType === "half"
      ? "반차요청"
      : props.requestType === "sick"
        ? "\uBCD1\uAC00\uC694\uCCAD"
        : props.requestType === "field_work"
          ? "\uC678\uADFC\uC694\uCCAD"
          : "\uC5F0\uCC28\uC694\uCCAD";`
);
modal = modal.replace(
  /const placeholder =\s*\n\s*props\.requestType === "half" \? "[^"]+" : props\.requestType === "sick" \? "[^"]+" : "[^"]+";/,
  `const placeholder =
    props.requestType === "half"
      ? "\uBC18\uCC28 \uC0AC\uC720"
      : props.requestType === "sick"
        ? "\uBCD1\uAC00 \uC0AC\uC720"
        : props.requestType === "field_work"
          ? "\uC678\uADFC \uC0AC\uC720"
          : "\uC5F0\uCC28 \uC0AC\uC720";`
);
fs.writeFileSync(modalPath, modal, "utf8");

const cardPath = new URL("../app/(admin)/attendance/_components/AttendanceStatusCard.tsx", import.meta.url);
const cardRaw = fs.readFileSync(cardPath, "utf8");
const lines = cardRaw.split(/\r?\n/);
const idx = lines.findIndex((l) => l.includes("canRequestSickLeave"));
if (idx !== -1) {
  lines.splice(
    idx,
    3,
    '        <TapButton onClick={props.onOpenFieldWorkModal} className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700">\uC678\uADFC\uC694\uCCAD</TapButton>',
    '        <TapButton onClick={props.onOpenSickLeaveModal} className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700">\uBCD1\uAC00\uC694\uCCAD</TapButton>'
  );
  fs.writeFileSync(cardPath, lines.join("\r\n"), "utf8");
}
