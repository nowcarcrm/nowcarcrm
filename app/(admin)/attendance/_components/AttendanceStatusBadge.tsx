"use client";

type Props = {
  status: string;
};

const STYLE_MAP: Record<string, string> = {
  승인된_연차: "bg-violet-50 text-violet-700 border-violet-200",
  근무_완료: "bg-emerald-50 text-emerald-700 border-emerald-200",
  출근_완료: "bg-sky-50 text-sky-700 border-sky-200",
  미출근: "bg-zinc-100 text-zinc-700 border-zinc-200",
  지각: "bg-amber-50 text-amber-700 border-amber-200",
  조기_퇴근: "bg-rose-50 text-rose-700 border-rose-200",
};

function normalize(status: string): string {
  return status.replaceAll(" ", "_");
}

export default function AttendanceStatusBadge({ status }: Props) {
  const cls = STYLE_MAP[normalize(status)] ?? "bg-zinc-100 text-zinc-700 border-zinc-200";
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${cls}`}>{status}</span>;
}
