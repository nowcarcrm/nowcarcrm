"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useAuth } from "@/app/_components/auth/AuthProvider";
import { isSettlementManager } from "../../../_lib/settlement/permissions";
import { supabase } from "../../../_lib/supabaseClient";
import { formatCurrency } from "../../../_lib/settlement/formatters";

type ParsedRow = {
  row_index: number;
  status: "valid" | "invalid";
  errors: string[];
  parsed?: {
    owner_name: string;
    customer_name: string;
    car_model: string;
    car_price: number;
    ag_commission: number;
  } & Record<string, unknown>;
};

export default function BulkDeliveryUploadPage() {
  const { profile, loading } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [summary, setSummary] = useState({ total: 0, valid: 0, invalid: 0 });

  const validRows = useMemo(() => rows.filter((r) => r.status === "valid" && r.parsed).map((r) => r.parsed as Record<string, unknown>), [rows]);
  const invalidRows = useMemo(() => rows.filter((r) => r.status === "invalid"), [rows]);

  async function getToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }

  async function downloadTemplate() {
    try {
      const token = await getToken();
      const res = await fetch("/api/settlement/deliveries/bulk-template", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "템플릿 다운로드 실패");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "출고_일괄등록_템플릿.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "템플릿 다운로드 실패");
    }
  }

  async function runParse() {
    if (!file) {
      toast.error("파일을 먼저 선택하세요.");
      return;
    }
    setBusy(true);
    try {
      const token = await getToken();
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/settlement/deliveries/bulk-parse", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const json = (await res.json()) as { total?: number; valid?: number; invalid?: number; rows?: ParsedRow[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "검증 실패");
      setRows(json.rows ?? []);
      setSummary({ total: Number(json.total ?? 0), valid: Number(json.valid ?? 0), invalid: Number(json.invalid ?? 0) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "검증 실패");
    } finally {
      setBusy(false);
    }
  }

  async function runCreate() {
    if (validRows.length === 0) {
      toast.error("등록할 정상 건이 없습니다.");
      return;
    }
    setBusy(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/settlement/deliveries/bulk-create", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rows: validRows }),
      });
      const json = (await res.json()) as { created?: number; failed?: Array<{ row_index: number; error: string }>; error?: string };
      if (!res.ok) throw new Error(json.error ?? "일괄 등록 실패");
      toast.success(`등록 완료: ${json.created ?? 0}건`);
      if ((json.failed ?? []).length > 0) {
        toast.error(`실패 ${(json.failed ?? []).length}건`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "일괄 등록 실패");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !profile) return <div className="py-16 text-center text-sm text-zinc-500">로딩 중…</div>;
  if (!isSettlementManager(profile)) return <div className="py-16 text-center text-sm text-rose-600">403 · 팀장 이상만 접근할 수 있습니다.</div>;

  return (
    <div className="space-y-5">
      <header className="crm-card p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold">출고 일괄 등록</h1>
          <Link href="/settlement/deliveries" className="crm-btn-secondary">
            출고 관리로
          </Link>
        </div>
      </header>

      <section className="crm-card p-5">
        <div className="space-y-4 text-sm">
          <div>
            <div className="font-semibold">[1단계] 템플릿 다운로드</div>
            <button type="button" className="crm-btn-secondary mt-2" onClick={() => void downloadTemplate()}>
              📥 빈 템플릿 다운로드
            </button>
          </div>
          <div>
            <div className="font-semibold">[2단계] 작성한 파일 업로드</div>
            <input
              className="crm-field mt-2"
              type="file"
              accept=".xlsx,.csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <button type="button" className="crm-btn-primary" disabled={busy} onClick={() => void runParse()}>
            검증 실행
          </button>
        </div>
      </section>

      <section className="crm-card p-5">
        <h2 className="text-base font-semibold">검증 결과</h2>
        <div className="mt-2 text-sm">총 {summary.total}건 | ✅ 정상 {summary.valid}건 | ❌ 오류 {summary.invalid}건</div>

        <div className="mt-4">
          <div className="mb-2 text-sm font-semibold">오류 건</div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                  <th className="px-3 py-2">행</th>
                  <th className="px-3 py-2">오류</th>
                </tr>
              </thead>
              <tbody>
                {invalidRows.map((r) => (
                  <tr key={`invalid-${r.row_index}`} className="border-b border-zinc-100">
                    <td className="px-3 py-2">{r.row_index}</td>
                    <td className="px-3 py-2 text-rose-600">{r.errors.join(" / ")}</td>
                  </tr>
                ))}
                {invalidRows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-2 text-zinc-500" colSpan={2}>
                      오류 건이 없습니다.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-2 text-sm font-semibold">정상 건 미리보기</div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                  <th className="px-3 py-2">담당자</th>
                  <th className="px-3 py-2">고객명</th>
                  <th className="px-3 py-2">차종</th>
                  <th className="px-3 py-2">차량가</th>
                  <th className="px-3 py-2">AG수수료</th>
                </tr>
              </thead>
              <tbody>
                {validRows.map((r, idx) => (
                  <tr key={`valid-${idx}`} className="border-b border-zinc-100">
                    <td className="px-3 py-2">{String(r.owner_name ?? "")}</td>
                    <td className="px-3 py-2">{String(r.customer_name ?? "")}</td>
                    <td className="px-3 py-2">{String(r.car_model ?? "")}</td>
                    <td className="px-3 py-2">{formatCurrency(Number(r.car_price ?? 0))}</td>
                    <td className="px-3 py-2">{formatCurrency(Number(r.ag_commission ?? 0))}</td>
                  </tr>
                ))}
                {validRows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-2 text-zinc-500" colSpan={5}>
                      정상 건이 없습니다.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="crm-btn-secondary" onClick={() => { setRows([]); setSummary({ total: 0, valid: 0, invalid: 0 }); }}>
            취소
          </button>
          <button type="button" className="crm-btn-primary" disabled={busy || validRows.length === 0} onClick={() => void runCreate()}>
            ✅ 정상 {summary.valid}건만 일괄 등록
          </button>
        </div>
      </section>
    </div>
  );
}
