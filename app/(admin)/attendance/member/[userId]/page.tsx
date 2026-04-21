"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/app/(admin)/_lib/supabaseClient";

function getCurrentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

type Line = { date: string; kind: string; reason: string | null; note: string | null };

type Payload = {
  month: string;
  target: {
    id: string;
    name: string;
    rank: string | null;
    teamName: string | null;
    remainingAnnualLeave: number;
  };
  lines: Line[];
};

export default function AttendanceMemberDetailPage() {
  const params = useParams();
  const userId = String(params?.userId ?? "").trim();

  const nowY = new Date().getFullYear();
  const yearOptions = useMemo(() => {
    const out: number[] = [];
    for (let y = nowY - 3; y <= nowY + 3; y += 1) out.push(y);
    return out;
  }, [nowY]);

  const [draftYear, setDraftYear] = useState(nowY);
  const [draftMonth, setDraftMonth] = useState(() => new Date().getMonth() + 1);
  const [activeMonth, setActiveMonth] = useState(getCurrentMonthKey);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Payload | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("로그인이 필요합니다.");
      const res = await fetch(`/api/attendance/member/${encodeURIComponent(userId)}?month=${encodeURIComponent(activeMonth)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as Payload & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "데이터를 불러오지 못했습니다.");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [userId, activeMonth]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!data?.month) return;
    const [y, m] = data.month.split("-").map(Number);
    if (Number.isFinite(y)) setDraftYear(y);
    if (Number.isFinite(m)) setDraftMonth(m);
  }, [data?.month]);

  const thisMonthUse = useMemo(() => {
    if (!data?.lines) return { annual: 0, half: 0, sick: 0, field: 0, late: 0 };
    let annual = 0;
    let half = 0;
    let sick = 0;
    let field = 0;
    let late = 0;
    for (const l of data.lines) {
      if (l.kind === "연차" || l.kind === "휴가") annual += 1;
      else if (l.kind === "반차") half += 1;
      else if (l.kind === "병가") sick += 1;
      else if (l.kind === "외근") field += 1;
      else if (l.kind === "지각") late += 1;
    }
    return { annual, half, sick, field, late };
  }, [data]);

  function applyMonthFilter() {
    setActiveMonth(`${draftYear}-${String(draftMonth).padStart(2, "0")}`);
  }

  return (
    <div className="crm-card">
      <div className="space-y-5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href="/attendance" className="text-sm font-medium text-indigo-600 hover:text-indigo-800">
              ← 근태 관리
            </Link>
            <h1 className="mt-2 text-xl font-semibold tracking-tight text-zinc-900">직원 근태 상세</h1>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-zinc-500">불러오는 중…</p>
        ) : error ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-800">{error}</p>
        ) : data ? (
          <>
            <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-baseline gap-3">
                <h2 className="text-lg font-semibold text-zinc-900">{data.target.name}</h2>
                <span className="text-sm text-zinc-600">
                  {data.target.rank || "-"} / {data.target.teamName || "-"}
                </span>
              </div>
              <p className="mt-2 text-sm text-zinc-700">
                잔여 연차: <span className="font-semibold text-indigo-700">{data.target.remainingAnnualLeave.toFixed(1)}회</span>
              </p>
              <p className="mt-2 text-xs text-zinc-500">
                이번 달 기록 요약 — 연차·휴가 {thisMonthUse.annual}일, 반차 {thisMonthUse.half}일, 병가 {thisMonthUse.sick}일, 외근{" "}
                {thisMonthUse.field}일, 지각 {thisMonthUse.late}일
              </p>
            </section>

            <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-zinc-900">조회 연·월</h3>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <select
                  className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                  value={draftYear}
                  onChange={(e) => setDraftYear(Number(e.target.value))}
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}년
                    </option>
                  ))}
                </select>
                <select
                  className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                  value={draftMonth}
                  onChange={(e) => setDraftMonth(Number(e.target.value))}
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {m}월
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => applyMonthFilter()}
                  className="rounded-lg border border-zinc-300 bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-800"
                >
                  조회
                </button>
              </div>
              <p className="mt-2 text-xs text-zinc-500">현재 표시: {data.month}</p>
            </section>

            <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-zinc-900">상세 내역</h3>
              {data.lines.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-500">해당 월 기록이 없습니다.</p>
              ) : (
                <div className="mt-3 overflow-hidden rounded-xl border border-zinc-200">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-zinc-50 text-xs text-zinc-500">
                      <tr>
                        <th className="px-3 py-2">날짜</th>
                        <th className="px-3 py-2">종류</th>
                        <th className="px-3 py-2">사유</th>
                        <th className="px-3 py-2">비고</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.lines.map((row, idx) => (
                        <tr key={`${row.date}-${row.kind}-${idx}`} className="border-t border-zinc-100">
                          <td className="px-3 py-2 text-zinc-800">{row.date}</td>
                          <td className="px-3 py-2 font-medium text-zinc-900">{row.kind}</td>
                          <td className="px-3 py-2 text-zinc-600">{row.reason ?? "-"}</td>
                          <td className="px-3 py-2 text-zinc-600">{row.note ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
