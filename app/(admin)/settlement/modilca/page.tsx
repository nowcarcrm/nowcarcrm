"use client";

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useAuth } from "@/app/_components/auth/AuthProvider";
import { supabase } from "../../_lib/supabaseClient";
import { isSuperAdmin } from "../../_lib/rolePermissions";
import { MonthNavigator } from "@/app/_components/settlement/MonthNavigator";

type MatchRow = {
  row: {
    row_index: number;
    mapped: {
      dealer_contract_no?: string;
      customer_name?: string;
      car_model?: string;
      ag_commission?: number;
    };
  };
  matched: boolean;
  delivery_id?: string;
  match_reason?: string;
};

const SYSTEM_FIELDS = ["__ignore__", "dealer_contract_no", "customer_name", "car_model", "ag_commission", "delivery_date"];

function monthNow() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function ModilcaPage() {
  const { profile, loading } = useAuth();
  const [uploadId, setUploadId] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [matchRows, setMatchRows] = useState<MatchRow[]>([]);
  const [decisions, setDecisions] = useState<Record<string, { action: "confirm" | "carry_over"; target_month: string }>>({});
  const [busy, setBusy] = useState(false);

  const canManage = useMemo(
    () => (profile ? isSuperAdmin({ email: profile.email, role: profile.role, rank: profile.rank }) : false),
    [profile]
  );

  async function getToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }

  async function onUpload(file: File) {
    setBusy(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("로그인이 필요합니다.");
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/settlement/modilca/parse", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const json = (await res.json()) as { upload_id?: string; raw_headers?: string[]; sample_rows?: Record<string, unknown>[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "업로드 실패");
      setUploadId(json.upload_id ?? "");
      setHeaders(json.raw_headers ?? []);
      setSampleRows(json.sample_rows ?? []);
      const nextMapping: Record<string, string> = {};
      for (const h of json.raw_headers ?? []) nextMapping[h] = "__ignore__";
      setMapping(nextMapping);
      setMatchRows([]);
      toast.success("업로드 완료");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "업로드 실패");
    } finally {
      setBusy(false);
    }
  }

  async function runMatch() {
    setBusy(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/settlement/modilca/match", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ upload_id: uploadId, mapping }),
      });
      const json = (await res.json()) as { match_results?: MatchRow[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "매칭 실패");
      const rows = json.match_results ?? [];
      setMatchRows(rows);
      const baseDecisions: Record<string, { action: "confirm" | "carry_over"; target_month: string }> = {};
      for (const r of rows) {
        if (!r.matched || !r.delivery_id) continue;
        baseDecisions[r.delivery_id] = { action: "confirm", target_month: monthNow() };
      }
      setDecisions(baseDecisions);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "매칭 실패");
    } finally {
      setBusy(false);
    }
  }

  async function applyAll() {
    setBusy(true);
    try {
      const token = await getToken();
      const body = {
        upload_id: uploadId,
        decisions: Object.entries(decisions).map(([delivery_id, v]) => ({
          delivery_id,
          action: v.action,
          target_month: v.action === "carry_over" ? v.target_month : undefined,
        })),
      };
      const res = await fetch("/api/settlement/modilca/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { applied?: number; error?: string };
      if (!res.ok) throw new Error(json.error ?? "적용 실패");
      toast.success(`적용 완료: ${json.applied ?? 0}건`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "적용 실패");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !profile) return <div className="py-16 text-center text-sm text-zinc-500">로딩 중…</div>;
  if (!canManage) return <div className="py-16 text-center text-sm text-rose-600">403 · 총괄대표만 접근할 수 있습니다.</div>;

  return (
    <div className="space-y-5">
      <header className="crm-card p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">모딜카 엑셀 정산</h1>
          <MonthNavigator currentMonth={monthNow()} />
        </div>
      </header>

      <section className="crm-card p-5">
        <p className="text-sm text-zinc-600">모딜카 엑셀 파일을 업로드하세요. 엑셀 컬럼을 시스템 필드에 매핑하면 자동 매칭됩니다.</p>
        <input
          className="mt-3 block w-full text-sm"
          type="file"
          accept=".xlsx"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onUpload(file);
          }}
        />
        {uploadId ? <div className="mt-2 text-xs text-zinc-500">upload_id: {uploadId}</div> : null}
      </section>

      {headers.length > 0 ? (
        <section className="crm-card p-5">
          <h2 className="text-base font-semibold">헤더 매핑</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {headers.map((h) => (
              <label key={h} className="text-sm">
                <span className="mr-2 inline-block min-w-[120px]">{h}</span>
                <select
                  className="crm-field crm-field-select"
                  value={mapping[h] ?? "__ignore__"}
                  onChange={(e) => setMapping((p) => ({ ...p, [h]: e.target.value }))}
                >
                  {SYSTEM_FIELDS.map((f) => (
                    <option key={f} value={f}>
                      {f === "__ignore__" ? "(매핑 안 함)" : f}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <button type="button" className="crm-btn-primary mt-4" disabled={busy} onClick={() => void runMatch()}>
            매칭 실행
          </button>
          <pre className="mt-3 max-h-40 overflow-auto rounded bg-zinc-100 p-3 text-xs">{JSON.stringify(sampleRows, null, 2)}</pre>
        </section>
      ) : null}

      {matchRows.length > 0 ? (
        <section className="crm-card p-5">
          <h2 className="text-base font-semibold">매칭 결과</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                  <th className="px-3 py-2">엑셀행</th>
                  <th className="px-3 py-2">계약번호</th>
                  <th className="px-3 py-2">고객명</th>
                  <th className="px-3 py-2">수수료</th>
                  <th className="px-3 py-2">매칭</th>
                  <th className="px-3 py-2">액션</th>
                </tr>
              </thead>
              <tbody>
                {matchRows.map((r, idx) => (
                  <tr key={`${r.row.row_index}-${idx}`} className="border-b border-zinc-100">
                    <td className="px-3 py-2">{r.row.row_index}</td>
                    <td className="px-3 py-2">{r.row.mapped.dealer_contract_no ?? "-"}</td>
                    <td className="px-3 py-2">{r.row.mapped.customer_name ?? "-"}</td>
                    <td className="px-3 py-2">{r.row.mapped.ag_commission?.toLocaleString("ko-KR") ?? "-"}</td>
                    <td className="px-3 py-2">{r.matched ? "✅" : "❌"}</td>
                    <td className="px-3 py-2">
                      {r.matched && r.delivery_id ? (
                        <div className="flex items-center gap-2">
                          <label className="inline-flex items-center gap-1">
                            <input
                              type="radio"
                              name={`act-${r.delivery_id}`}
                              checked={decisions[r.delivery_id]?.action === "confirm"}
                              onChange={() =>
                                setDecisions((p) => ({ ...p, [r.delivery_id!]: { ...(p[r.delivery_id!] ?? { target_month: monthNow() }), action: "confirm" } }))
                              }
                            />
                            확정
                          </label>
                          <label className="inline-flex items-center gap-1">
                            <input
                              type="radio"
                              name={`act-${r.delivery_id}`}
                              checked={decisions[r.delivery_id]?.action === "carry_over"}
                              onChange={() =>
                                setDecisions((p) => ({ ...p, [r.delivery_id!]: { ...(p[r.delivery_id!] ?? { target_month: monthNow() }), action: "carry_over" } }))
                              }
                            />
                            이월
                          </label>
                          {decisions[r.delivery_id]?.action === "carry_over" ? (
                            <input
                              className="crm-field w-28"
                              value={decisions[r.delivery_id]?.target_month ?? monthNow()}
                              onChange={(e) => setDecisions((p) => ({ ...p, [r.delivery_id!]: { ...(p[r.delivery_id!] ?? { action: "carry_over" }), target_month: e.target.value } }))}
                              placeholder="YYYY-MM"
                            />
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-500">수동 매칭 필요</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="crm-btn-primary mt-4" disabled={busy} onClick={() => void applyAll()}>
            일괄 확정 적용
          </button>
        </section>
      ) : null}
    </div>
  );
}
