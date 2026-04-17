"use client";

type Props = {
  status: string;
};

const SICK = "\uBCD1\uAC00";

const STYLE_MAP: Record<string, string> = {
  "\uC2B9\uC778\uB41C_\uC5F0\uCC28": "bg-violet-50 text-violet-700 border-violet-200",
  "\uC2B9\uC778\uB41C_\uC678\uADFC": "bg-indigo-50 text-indigo-700 border-indigo-200",
  "\uC2B9\uC778\uB41C_\uBC18\uCC28": "bg-sky-50 text-sky-800 border-sky-200",
  [`\uC2B9\uC778\uB41C_${SICK}`]: "bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200",
  "\uADFC\uBB34_\uC644\uB8CC": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "\uCD9C\uADFC_\uC644\uB8CC": "bg-sky-50 text-sky-700 border-sky-200",
  "\uC815\uC0C1_\uCD9C\uADFC": "bg-sky-50 text-sky-700 border-sky-200",
  "\uBBF8\uCD9C\uADFC": "bg-rose-50 text-rose-700 border-rose-200",
  "\uB300\uAE30\uC911": "bg-zinc-100 text-zinc-600 border-zinc-200",
  "\uC678\uADFC_\uC2E0\uCCAD\uC911": "bg-amber-50 text-amber-800 border-amber-200",
  "\uC9C0\uAC01": "bg-rose-50 text-rose-700 border-rose-200",
  "\uC870\uAE30_\uD1F4\uADFC": "bg-rose-50 text-rose-700 border-rose-200",
  "\uC5F0\uCC28": "bg-violet-50 text-violet-700 border-violet-200",
  "\uBC18\uCC28": "bg-sky-50 text-sky-800 border-sky-200",
  [SICK]: "bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200",
  "\uC678\uADFC": "bg-indigo-50 text-indigo-700 border-indigo-200",
  "\uD734\uAC00": "bg-violet-50 text-violet-700 border-violet-200",
};

function normalize(status: string): string {
  return status.replaceAll(" ", "_");
}

export default function AttendanceStatusBadge({ status }: Props) {
  const key = normalize(status);
  const cls = STYLE_MAP[key] ?? STYLE_MAP[status] ?? "bg-zinc-100 text-zinc-700 border-zinc-200";
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${cls}`}>{status}</span>;
}
