"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useAuth } from "@/app/_components/auth/AuthProvider";
import {
  fetchContractFeeSummaryByLeadIds,
  fetchLeadById,
  fetchMaxConsultationCreatedAtByLeadIds,
} from "../../_lib/leaseCrmSupabase";
import {
  applyStaffLeadClientLocks,
  loadLeadsFromStorage,
  updateLead,
  deleteLeadById,
} from "../../_lib/leaseCrmStorage";
import type { Lead } from "../../_lib/leaseCrmTypes";
import { pipelineStageLabelForLead } from "../../_lib/staffOverviewMetrics";
import {
  downloadXlsxRows,
  formatDateForExcel,
  formatDateOnlyForExcel,
  formatWonForExcel,
  todayYmdKst,
} from "../../_lib/excelExport";
import LeadDetailModal from "../../leads/_components/LeadDetailModal";
import { lastContactReferenceIso } from "../../_lib/leaseCrmLogic";
import { effectiveContractFeeForMetrics } from "../../_lib/leaseCrmContractPersist";
import { listActiveUsers } from "../../_lib/usersSupabase";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function AllCustomersOperationalPage() {
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [lastConsultByLead, setLastConsultByLead] = useState<Map<string, string>>(
    () => new Map()
  );
  const [contractByLead, setContractByLead] = useState<
    Map<string, { feeWon: number; contractDate: string }>
  >(() => new Map());
  const [managerNameById, setManagerNameById] = useState<Map<string, string>>(
    () => new Map()
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modalLead, setModalLead] = useState<Lead | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [search, setSearch] = useState("");

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
    if (!opScope) return;
    let mounted = true;
    (async () => {
      try {
        const users = await listActiveUsers();
        const nameMap = new Map(users.map((u) => [u.id, u.name?.trim() || ""]));
        const loaded = await loadLeadsFromStorage(opScope);
        const ids = loaded.map((l) => l.id);
        const [consultMap, contractMap] = await Promise.all([
          fetchMaxConsultationCreatedAtByLeadIds(ids, opScope),
          fetchContractFeeSummaryByLeadIds(ids, opScope),
        ]);
        if (!mounted) return;
        setManagerNameById(nameMap);
        setLastConsultByLead(consultMap);
        setContractByLead(contractMap);
        setLoadError(null);
        setLeads(loaded);
      } catch (e) {
        if (!mounted) return;
        const msg = e instanceof Error ? e.message : String(e);
        setLoadError(msg);
        toast.error("전체 고객을 불러오지 못했습니다.");
        setLeads([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [profile, authLoading, router, opScope]);

  const sortedLeads = useMemo(() => {
    if (!leads) return [];
    return [...leads].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [leads]);

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qd = search.replace(/\D/g, "");
    if (!q) return sortedLeads;
    return sortedLeads.filter((l) => {
      const name = l.base.name.toLowerCase();
      const phone = l.base.phone.toLowerCase();
      const phoneD = l.base.phone.replace(/\D/g, "");
      const mid = (l.managerUserId ?? "").trim();
      const mgr = (mid ? managerNameById.get(mid) : "") || l.base.ownerStaff || "";
      const mgrLower = mgr.toLowerCase();
      if (name.includes(q) || phone.includes(q) || mgrLower.includes(q)) return true;
      if (qd.length >= 2 && phoneD.includes(qd)) return true;
      return false;
    });
  }, [sortedLeads, search, managerNameById]);

  const openLead = useCallback(
    async (id: string) => {
      if (!opScope) return;
      setModalLoading(true);
      try {
        const lead = await fetchLeadById(id, opScope);
        if (!lead) {
          toast.error("고객을 찾을 수 없습니다.");
          return;
        }
        setModalLead(lead);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "불러오기 실패");
      } finally {
        setModalLoading(false);
      }
    },
    [opScope]
  );

  const onDownloadExcel = useCallback(() => {
    if (!filteredLeads.length) {
      toast.error("보낼 데이터가 없습니다.");
      return;
    }
    const rows = filteredLeads.map((l) => {
      const mid = (l.managerUserId ?? "").trim();
      const consult = lastConsultByLead.get(l.id);
      const recent =
        consult && consult > lastContactReferenceIso(l) ? consult : lastContactReferenceIso(l);
      const feeFromLead =
        l.contract != null ? effectiveContractFeeForMetrics(l.contract) : contractByLead.get(l.id)?.feeWon ?? null;
      const vehicle = l.contract?.vehicleName?.trim() || l.base.desiredVehicle || "";
      return {
        등록일: formatDateOnlyForExcel(l.createdAt),
        고객명: l.base.name,
        연락처: l.base.phone,
        담당자: mid ? managerNameById.get(mid) || l.base.ownerStaff : l.base.ownerStaff,
        상담결과: l.counselingStatus,
        현재단계: pipelineStageLabelForLead(l),
        다음연락예정일: formatDateOnlyForExcel(l.nextContactAt),
        최근상담일: formatDateForExcel(recent),
        차량정보: vehicle,
        수수료: formatWonForExcel(feeFromLead),
      };
    });
    downloadXlsxRows(rows, "전체상담고객", `전체상담고객_${todayYmdKst()}`);
    toast.success("엑셀 파일을 저장했습니다.");
  }, [filteredLeads, lastConsultByLead, managerNameById, contractByLead]);

  if (authLoading || !profile) {
    return (
      <div className="py-16 text-center text-sm text-slate-500">로딩 중…</div>
    );
  }

  if (profile.role !== "admin") {
    return null;
  }

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-slate-200/90 bg-gradient-to-br from-slate-50 to-white px-6 py-5 shadow-sm dark:border-zinc-800 dark:from-zinc-900 dark:to-zinc-950">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-sky-700 dark:text-sky-400">
              운영 · 관리자 보고
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-zinc-50">
              전체 상담 고객
            </h1>
            <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-slate-600 dark:text-zinc-400">
              전사 DB·인수인계·백업용입니다. 일반 영업 메뉴와 달리 담당자 필터 없이 전체가 표시됩니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onDownloadExcel}
            className="inline-flex shrink-0 items-center justify-center rounded-xl border border-emerald-600/80 bg-emerald-600 px-5 py-2.5 text-[14px] font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            엑셀 다운로드
          </button>
        </div>
        <div className="mt-4 max-w-md">
          <label className="mb-1 block text-[12px] font-medium text-slate-500 dark:text-zinc-400">
            검색 (고객명 · 연락처 · 담당자명)
          </label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="crm-field w-full text-[14px]"
            placeholder="검색어 입력"
          />
        </div>
      </header>

      {loadError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-900 dark:border-rose-500/40 dark:bg-rose-950/40 dark:text-rose-100">
          {loadError}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="overflow-x-auto">
          <table className="min-w-[1280px] w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/95 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-400">
                <th className="px-3 py-3">등록일</th>
                <th className="px-3 py-3">고객명</th>
                <th className="px-3 py-3">연락처</th>
                <th className="px-3 py-3">담당자</th>
                <th className="px-3 py-3">상담결과</th>
                <th className="px-3 py-3">현재 단계</th>
                <th className="px-3 py-3">다음 연락</th>
                <th className="px-3 py-3">최근 상담</th>
                <th className="px-3 py-3">희망 차종</th>
                <th className="px-3 py-3">수수료</th>
                <th className="px-3 py-3 text-right">작업</th>
              </tr>
            </thead>
            <tbody>
              {leads === null ? (
                <tr>
                  <td colSpan={11} className="px-3 py-12 text-center text-slate-500">
                    불러오는 중…
                  </td>
                </tr>
              ) : filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-3 py-12 text-center text-slate-500">
                    {sortedLeads.length === 0 ? "등록된 고객이 없습니다." : "검색 결과가 없습니다."}
                  </td>
                </tr>
              ) : (
                filteredLeads.map((l) => {
                  const mid = (l.managerUserId ?? "").trim();
                  const mgr =
                    (mid && managerNameById.get(mid)) || l.base.ownerStaff || "—";
                  const consult = lastConsultByLead.get(l.id);
                  const recent =
                    consult && consult > lastContactReferenceIso(l)
                      ? consult
                      : lastContactReferenceIso(l);
                  const feeFromLead =
                    l.contract != null
                      ? effectiveContractFeeForMetrics(l.contract)
                      : contractByLead.get(l.id)?.feeWon ?? null;
                  const vehicle = l.contract?.vehicleName?.trim() || l.base.desiredVehicle || "—";
                  return (
                    <tr
                      key={l.id}
                      className="border-b border-slate-100 transition hover:bg-sky-50/60 dark:border-zinc-800/80 dark:hover:bg-sky-950/25"
                    >
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-600 dark:text-zinc-400">
                        {formatDateOnlyForExcel(l.createdAt)}
                      </td>
                      <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-zinc-100">
                        {l.base.name}
                      </td>
                      <td className="px-3 py-2.5 text-slate-700 dark:text-zinc-300">
                        {l.base.phone}
                      </td>
                      <td className="px-3 py-2.5 text-slate-700 dark:text-zinc-300">{mgr}</td>
                      <td className="px-3 py-2.5">
                        <span
                          className={cn(
                            "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                            "border-slate-200 bg-white text-slate-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                          )}
                        >
                          {l.counselingStatus}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-700 dark:text-zinc-300">
                        {pipelineStageLabelForLead(l)}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-600 dark:text-zinc-400">
                        {formatDateOnlyForExcel(l.nextContactAt)}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-600 dark:text-zinc-400">
                        {formatDateForExcel(recent)}
                      </td>
                      <td className="max-w-[200px] truncate px-3 py-2.5 text-slate-700 dark:text-zinc-300">
                        {vehicle}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-800 dark:text-zinc-200">
                        {feeFromLead != null && feeFromLead > 0
                          ? `${Math.floor(feeFromLead).toLocaleString("ko-KR")}원`
                          : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => void openLead(l.id)}
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[12px] font-medium text-sky-700 hover:bg-slate-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-sky-300 dark:hover:bg-zinc-800"
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

      {modalLoading ? (
        <div className="fixed inset-0 z-[55] grid place-items-center bg-black/20 text-sm font-medium text-slate-700 dark:text-zinc-200">
          불러오는 중…
        </div>
      ) : null}

      {modalLead && profile && opScope ? (
        <LeadDetailModal
          key={modalLead.id}
          lead={modalLead}
          onClose={() => setModalLead(null)}
          onUpdate={async (next) => {
            const payload =
              profile.role === "staff"
                ? applyStaffLeadClientLocks(next, { userId: profile.userId, name: profile.name })
                : next;
            await updateLead(payload, opScope);
            setModalLead(payload);
            setLeads((prev) => {
              const nextList = prev ? prev.map((x) => (x.id === payload.id ? payload : x)) : prev;
              if (nextList) {
                const ids = nextList.map((x) => x.id);
                void (async () => {
                  const [cm, cfm] = await Promise.all([
                    fetchMaxConsultationCreatedAtByLeadIds(ids, opScope),
                    fetchContractFeeSummaryByLeadIds(ids, opScope),
                  ]);
                  setLastConsultByLead(cm);
                  setContractByLead(cfm);
                })();
              }
              return nextList;
            });
            toast.success("저장되었습니다.");
          }}
          onDelete={(id) => {
            void (async () => {
              try {
                await deleteLeadById(id, opScope);
                setModalLead(null);
                setLeads((prev) => (prev ? prev.filter((x) => x.id !== id) : prev));
                toast.success("삭제되었습니다.");
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "삭제 실패");
              }
            })();
          }}
        />
      ) : null}
    </div>
  );
}
