"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
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
type UploadRow = {
  id: string;
  file_name: string | null;
  uploaded_at: string;
  matched_count: number;
  unmatched_count: number;
  status: string;
  uploaded_by_name?: string;
};
type MappingRow = {
  id: string;
  name: string;
  mapping_json: Record<string, string>;
  updated_at?: string;
  created_at?: string;
};

const SYSTEM_FIELDS = ["__ignore__", "dealer_contract_no", "customer_name", "car_model", "ag_commission", "delivery_date"];

function monthNow() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function ModilcaPage() {
  const { profile, loading } = useAuth();
  const searchParams = useSearchParams();
  const month = (searchParams?.get("month") ?? monthNow()).trim();
  const [uploadId, setUploadId] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [matchRows, setMatchRows] = useState<MatchRow[]>([]);
  const [decisions, setDecisions] = useState<Record<string, { action: "confirm" | "carry_over"; target_month: string }>>({});
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"upload" | "history" | "mappings">("upload");
  const [historyRows, setHistoryRows] = useState<UploadRow[]>([]);
  const [historyStatus, setHistoryStatus] = useState("");
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [savedMappings, setSavedMappings] = useState<MappingRow[]>([]);
  const [selectedUpload, setSelectedUpload] = useState<Record<string, unknown> | null>(null);

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

  async function loadHistory() {
    const token = await getToken();
    const sp = new URLSearchParams();
    sp.set("limit", "20");
    sp.set("offset", String(historyOffset));
    if (historyStatus) sp.set("status", historyStatus);
    const res = await fetch(`/api/settlement/modilca/uploads?${sp.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
    const json = (await res.json()) as { uploads?: UploadRow[]; total?: number };
    if (res.ok) {
      setHistoryRows(json.uploads ?? []);
      setHistoryTotal(Number(json.total ?? 0));
    }
  }

  async function loadMappings() {
    const token = await getToken();
    const res = await fetch("/api/settlement/modilca/uploads?include_mappings=true&limit=1&offset=0", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as { mappings?: MappingRow[] };
    if (res.ok) setSavedMappings(json.mappings ?? []);
  }

  async function openUploadDetail(id: string) {
    const token = await getToken();
    const res = await fetch(`/api/settlement/modilca/uploads/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    const json = (await res.json()) as { upload?: Record<string, unknown> };
    if (res.ok) setSelectedUpload(json.upload ?? null);
  }

  async function removeMapping(id: string) {
    if (!confirm("저장된 매핑을 삭제하시겠습니까?")) return;
    const token = await getToken();
    const res = await fetch(`/api/settlement/modilca/mappings/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const json = (await res.json()) as { error?: string };
      toast.error(json.error ?? "매핑 삭제 실패");
      return;
    }
    toast.success("매핑이 삭제되었습니다.");
    await loadMappings();
  }

  useEffect(() => {
    if (tab === "history") void loadHistory();
  }, [tab, historyOffset, historyStatus]);

  async function downloadSubmissionExcel() {
    try {
      const token = await getToken();
      if (!token) throw new Error("로그인이 필요합니다.");
      const res = await fetch(`/api/settlement/modilca/export?month=${encodeURIComponent(month)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "엑셀 다운로드 실패");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `모딜카제출_${month}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "엑셀 다운로드 실패");
    }
  }

  if (loading || !profile) return <div className="py-16 text-center text-sm text-zinc-500">로딩 중…</div>;
  if (!canManage) return <div className="py-16 text-center text-sm text-rose-600">403 · 총괄대표만 접근할 수 있습니다.</div>;

  return (
    <div className="space-y-5">
      <header className="crm-card p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">모딜카 엑셀 정산</h1>
          <MonthNavigator currentMonth={month} />
        </div>
        <div className="mt-3">
          <button type="button" className="crm-btn-secondary" onClick={() => void downloadSubmissionExcel()}>
            📤 모딜카 제출용 엑셀
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={tab === "upload" ? "crm-btn-primary" : "crm-btn-secondary"} onClick={() => setTab("upload")}>
            📤 새로 업로드
          </button>
          <button
            type="button"
            className={tab === "history" ? "crm-btn-primary" : "crm-btn-secondary"}
            onClick={() => {
              setTab("history");
              void loadHistory();
            }}
          >
            📋 이력 보기
          </button>
          <button
            type="button"
            className={tab === "mappings" ? "crm-btn-primary" : "crm-btn-secondary"}
            onClick={() => {
              setTab("mappings");
              void loadMappings();
            }}
          >
            ⚙️ 저장된 매핑
          </button>
        </div>
      </header>

      {tab === "upload" ? (
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
      ) : null}

      {tab === "upload" && headers.length > 0 ? (
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

      {tab === "upload" && matchRows.length > 0 ? (
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

      {tab === "history" ? (
        <section className="crm-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <select className="crm-field crm-field-select" value={historyStatus} onChange={(e) => setHistoryStatus(e.target.value)}>
              <option value="">상태: 전체</option>
              <option value="pending">pending</option>
              <option value="matching">matching</option>
              <option value="applied">applied</option>
            </select>
            <button type="button" className="crm-btn-secondary" onClick={() => void loadHistory()}>
              조회
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                  <th className="px-3 py-2">업로드일시</th>
                  <th className="px-3 py-2">파일명</th>
                  <th className="px-3 py-2">매칭</th>
                  <th className="px-3 py-2">미매칭</th>
                  <th className="px-3 py-2">상태</th>
                </tr>
              </thead>
              <tbody>
                {historyRows.map((u) => (
                  <tr key={u.id} className="cursor-pointer border-b border-zinc-100 hover:bg-zinc-50" onClick={() => void openUploadDetail(u.id)}>
                    <td className="px-3 py-2">{new Date(u.uploaded_at).toLocaleString("ko-KR")}</td>
                    <td className="px-3 py-2">{u.file_name ?? "-"}</td>
                    <td className="px-3 py-2">{u.matched_count}</td>
                    <td className="px-3 py-2">{u.unmatched_count}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${u.status === "applied" ? "bg-emerald-100 text-emerald-700" : u.status === "matching" ? "bg-amber-100 text-amber-700" : "bg-zinc-100 text-zinc-700"}`}>
                        {u.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {historyRows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-zinc-500" colSpan={5}>
                      이력이 없습니다.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="crm-btn-secondary" disabled={historyOffset === 0} onClick={() => setHistoryOffset((v) => Math.max(0, v - 20))}>
              이전
            </button>
            <button
              type="button"
              className="crm-btn-secondary"
              disabled={historyOffset + 20 >= historyTotal}
              onClick={() => setHistoryOffset((v) => v + 20)}
            >
              다음
            </button>
          </div>
        </section>
      ) : null}

      {tab === "mappings" ? (
        <section className="crm-card p-5">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                  <th className="px-3 py-2">매핑 이름</th>
                  <th className="px-3 py-2">생성일</th>
                  <th className="px-3 py-2">작업</th>
                </tr>
              </thead>
              <tbody>
                {savedMappings.map((m) => (
                  <tr key={m.id} className="border-b border-zinc-100">
                    <td className="px-3 py-2">{m.name}</td>
                    <td className="px-3 py-2">{new Date(m.updated_at ?? m.created_at ?? "").toLocaleString("ko-KR")}</td>
                    <td className="px-3 py-2">
                      <button type="button" className="crm-btn-secondary mr-2" onClick={() => alert(JSON.stringify(m.mapping_json, null, 2))}>
                        보기
                      </button>
                      <button type="button" className="crm-btn-secondary" onClick={() => void removeMapping(m.id)}>
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
                {savedMappings.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-zinc-500" colSpan={3}>
                      저장된 매핑이 없습니다.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {selectedUpload ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl rounded-xl bg-white p-5 dark:bg-zinc-900">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">업로드 상세</h3>
              <button type="button" className="crm-btn-secondary" onClick={() => setSelectedUpload(null)}>
                닫기
              </button>
            </div>
            <pre className="mt-3 max-h-[60vh] overflow-auto rounded bg-zinc-100 p-3 text-xs">{JSON.stringify(selectedUpload, null, 2)}</pre>
          </div>
        </div>
      ) : null}
    </div>
  );
}
