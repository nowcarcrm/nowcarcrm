"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useAuth } from "@/app/_components/auth/AuthProvider";
import {
  fetchContractFeeSummaryByLeadIds,
  fetchMaxConsultationCreatedAtByLeadIds,
} from "../../../_lib/leaseCrmSupabase";
import {
  loadLeadsFromStorage,
} from "../../../_lib/leaseCrmStorage";
import type { Lead } from "../../../_lib/leaseCrmTypes";
import { pipelineStageLabelForLead } from "../../../_lib/staffOverviewMetrics";
import {
  downloadXlsxRows,
  formatDateForExcel,
  formatDateOnlyForExcel,
  formatWonForExcel,
  todayYmdKst,
} from "../../../_lib/excelExport";
import { lastContactReferenceIso } from "../../../_lib/leaseCrmLogic";
import { effectiveContractFeeForMetrics } from "../../../_lib/leaseCrmContractPersist";
import { listActiveUsers } from "../../../_lib/usersSupabase";
import { useLeadDetailModal } from "@/app/_components/admin/AdminShell";

export default function StaffCustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const userId = typeof params.userId === "string" ? params.userId : "";
  const { profile, loading: authLoading } = useAuth();
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [staffName, setStaffName] = useState("");
  const [lastConsultByLead, setLastConsultByLead] = useState<Map<string, string>>(
    () => new Map()
  );
  const [contractByLead, setContractByLead] = useState<
    Map<string, { feeWon: number; contractDate: string }>
  >(() => new Map());
  const [loadError, setLoadError] = useState<string | null>(null);
  const { openLeadById } = useLeadDetailModal();

  const opScope = useMemo(() => {
    if (!profile || profile.role !== "admin") return null;
    return {
      role: "admin" as const,
      userId: profile.userId,
      operationalFullAccess: true,
    };
  }, [profile]);

  useEffect(() => {
    if (authLoading) return;
    if (!profile || profile.role !== "admin") {
      router.replace("/dashboard");
      return;
    }
    if (!opScope || !userId) return;
    let mounted = true;
    (async () => {
      try {
        const users = await listActiveUsers();
        const u = users.find((x) => x.id === userId);
        const loaded = await loadLeadsFromStorage(opScope);
        const mine = loaded.filter((l) => (l.managerUserId ?? "").trim() === userId);
        const ids = mine.map((l) => l.id);
        const [contracts, consultMap] = await Promise.all([
          fetchContractFeeSummaryByLeadIds(ids, opScope),
          fetchMaxConsultationCreatedAtByLeadIds(ids, opScope),
        ]);
        if (!mounted) return;
        setStaffName(u?.name?.trim() || mine[0]?.base.ownerStaff || "직원");
        setContractByLead(contracts);
        setLastConsultByLead(consultMap);
        setLoadError(null);
        setLeads(mine);
      } catch (e) {
        if (!mounted) return;
        setLoadError(e instanceof Error ? e.message : String(e));
        toast.error("데이터를 불러오지 못했습니다.");
        setLeads([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [profile, authLoading, router, opScope, userId]);

  const sorted = useMemo(() => {
    if (!leads) return [];
    return [...leads].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [leads]);

  const openLead = useCallback(
    async (id: string) => {
      await openLeadById(id);
    },
    [openLeadById]
  );

  const onExcel = useCallback(() => {
    if (!sorted.length) {
      toast.error("보낼 고객이 없습니다.");
      return;
    }
    const safeName = staffName.replace(/[<>:"/\\|?*\s]+/g, "_").slice(0, 40) || "직원";
    const rows = sorted.map((l) => {
      const consult = lastConsultByLead.get(l.id);
      const recent =
        consult && consult > lastContactReferenceIso(l)
          ? consult
          : lastContactReferenceIso(l);
      const fee =
        l.contract != null
          ? effectiveContractFeeForMetrics(l.contract)
          : contractByLead.get(l.id)?.feeWon ?? null;
      const vehicle = l.contract?.vehicleName?.trim() || l.base.desiredVehicle || "";
      return {
        등록일: formatDateOnlyForExcel(l.createdAt),
        고객명: l.base.name,
        연락처: l.base.phone,
        상담결과: l.counselingStatus,
        현재단계: pipelineStageLabelForLead(l),
        다음연락예정일: formatDateOnlyForExcel(l.nextContactAt),
        최근상담일: formatDateForExcel(recent),
        차량정보: vehicle,
        수수료: formatWonForExcel(fee),
      };
    });
    downloadXlsxRows(rows, "고객목록", `${safeName}_고객목록_${todayYmdKst()}`);
    toast.success("엑셀을 저장했습니다.");
  }, [sorted, staffName, lastConsultByLead, contractByLead]);

  if (authLoading || !profile) {
    return <div className="py-16 text-center text-sm text-slate-500">로딩 중…</div>;
  }

  if (profile.role !== "admin") {
    return null;
  }

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-slate-200/90 bg-white px-6 py-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href="/operations/staff-overview"
              className="text-[13px] font-semibold text-violet-600 hover:underline dark:text-violet-400"
            >
              ← 직원 현황
            </Link>
            <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-zinc-50">
              {staffName || "…"} · 담당 고객
            </h1>
            <p className="mt-1 text-[14px] text-slate-600 dark:text-zinc-400">
              manager_user_id 일치 고객만 표시합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onExcel}
            disabled={!sorted.length}
            className="rounded-xl border border-emerald-600 bg-emerald-600 px-5 py-2.5 text-[14px] font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-40"
          >
            엑셀 다운로드
          </button>
        </div>
      </header>

      {loadError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-900 dark:border-rose-500/40 dark:bg-rose-950/40 dark:text-rose-100">
          {loadError}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="overflow-x-auto">
          <table className="min-w-[1000px] w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                <th className="px-3 py-3">고객명</th>
                <th className="px-3 py-3">연락처</th>
                <th className="px-3 py-3">등록일</th>
                <th className="px-3 py-3">상담결과</th>
                <th className="px-3 py-3">단계</th>
                <th className="px-3 py-3">다음 연락</th>
                <th className="px-3 py-3">최근 상담</th>
                <th className="px-3 py-3">차량</th>
                <th className="px-3 py-3">수수료</th>
                <th className="px-3 py-3 text-right">상세</th>
              </tr>
            </thead>
            <tbody>
              {leads === null ? (
                <tr>
                  <td colSpan={10} className="px-3 py-12 text-center text-slate-500">
                    불러오는 중…
                  </td>
                </tr>
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-12 text-center text-slate-500">
                    담당 고객이 없습니다.
                  </td>
                </tr>
              ) : (
                sorted.map((l) => {
                  const consult = lastConsultByLead.get(l.id);
                  const recent =
                    consult && consult > lastContactReferenceIso(l)
                      ? consult
                      : lastContactReferenceIso(l);
                  const fee =
                    l.contract != null
                      ? effectiveContractFeeForMetrics(l.contract)
                      : contractByLead.get(l.id)?.feeWon ?? null;
                  const vehicle =
                    l.contract?.vehicleName?.trim() || l.base.desiredVehicle || "—";
                  return (
                    <tr key={l.id} className="border-b border-slate-100 dark:border-zinc-800">
                      <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-zinc-100">
                        {l.base.name}
                      </td>
                      <td className="px-3 py-2.5 text-slate-700 dark:text-zinc-300">
                        {l.base.phone}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-600 dark:text-zinc-400">
                        {formatDateOnlyForExcel(l.createdAt)}
                      </td>
                      <td className="px-3 py-2.5">{l.counselingStatus}</td>
                      <td className="px-3 py-2.5">{pipelineStageLabelForLead(l)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-600 dark:text-zinc-400">
                        {formatDateOnlyForExcel(l.nextContactAt)}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-600 dark:text-zinc-400">
                        {formatDateForExcel(recent)}
                      </td>
                      <td className="px-3 py-2.5 text-slate-700 dark:text-zinc-300">{vehicle}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {fee != null && fee > 0
                          ? `${Math.floor(fee).toLocaleString("ko-KR")}원`
                          : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => void openLead(l.id)}
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-[12px] font-medium text-sky-700 hover:bg-slate-50 dark:border-zinc-600 dark:text-sky-300"
                        >
                          상세
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
