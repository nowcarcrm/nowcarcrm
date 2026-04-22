/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { useAuth } from "@/app/_components/auth/AuthProvider";
import { getDeliveryScope, isDirector, isTeamLeader } from "../../_lib/settlement/permissions";
import { isSuperAdmin } from "../../_lib/rolePermissions";
import { supabase } from "../../_lib/supabaseClient";
import { formatCurrency } from "../../_lib/settlement/formatters";
import type { DeliveryWithNames, DeliveryStatus } from "../../_types/settlement";

type OwnerOption = { id: string; name: string; team_name: string | null };
const FINANCE_COMPANIES = [
  "현대캐피탈",
  "KB캐피탈",
  "신한캐피탈",
  "하나캐피탈",
  "우리캐피탈",
  "기아캐피탈",
  "롯데캐피탈",
  "NH캐피탈",
  "JB우리캐피탈",
  "BNK캐피탈",
];

function monthNow() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function moveMonth(month: string, diff: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + diff, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function statusClass(status: DeliveryStatus | string) {
  switch (status) {
    case "draft":
      return "bg-zinc-100 text-zinc-700";
    case "pending_leader":
      return "bg-amber-100 text-amber-700";
    case "pending_director":
      return "bg-orange-100 text-orange-700";
    case "approved_director":
      return "bg-sky-100 text-sky-700";
    case "confirmed":
      return "bg-emerald-100 text-emerald-700";
    case "carried_over":
      return "bg-violet-100 text-violet-700";
    case "finalized":
      return "bg-emerald-200 text-emerald-900";
    default:
      return "bg-zinc-100 text-zinc-700";
  }
}

export default function SettlementDeliveriesPage() {
  const { profile, loading } = useAuth();
  const searchParams = useSearchParams();
  const [month, setMonth] = useState(monthNow());
  const [status, setStatus] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [team, setTeam] = useState("");
  const [search, setSearch] = useState("");
  const [allPeriod, setAllPeriod] = useState(false);
  const [financialCompany, setFinancialCompany] = useState("");
  const [productType, setProductType] = useState("");
  const [deliveryType, setDeliveryType] = useState("");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [myPendingOnly, setMyPendingOnly] = useState(false);
  const [rows, setRows] = useState<DeliveryWithNames[]>([]);
  const [ownerOptions, setOwnerOptions] = useState<OwnerOption[]>([]);
  const [busy, setBusy] = useState(false);

  const scope = useMemo(
    () =>
      profile
        ? getDeliveryScope({
            id: profile.userId,
            role: profile.role,
            rank: profile.rank,
            team_name: profile.teamName,
            email: profile.email,
          })
        : { scope: "own" as const, user_id: "" },
    [profile]
  );
  const showOwnerFilter = scope.scope !== "own";
  const showTeamFilter = scope.scope === "all";

  async function getToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }

  async function loadOwners() {
    const token = await getToken();
    if (!token) return;
    const res = await fetch("/api/settlement/deliveries/available-owners", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as { owners?: OwnerOption[] };
    if (res.ok) setOwnerOptions(json.owners ?? []);
  }

  async function loadRows() {
    setBusy(true);
    try {
      const token = await getToken();
      if (!token) return;
      const sp = new URLSearchParams();
      if (!allPeriod) sp.set("month", month);
      if (search.trim()) sp.set("search", search.trim());
      if (allPeriod) sp.set("all_period", "true");
      if (financialCompany) sp.set("financial_company", financialCompany);
      if (productType) sp.set("product_type", productType);
      if (deliveryType) sp.set("delivery_type", deliveryType);
      if (myPendingOnly && profile) {
        if (isSuperAdmin(profile) || profile.role === "super_admin") {
          sp.set("status", "pending_leader,pending_director");
        } else if (isDirector(profile)) {
          sp.set("status", "pending_director");
        } else if (isTeamLeader(profile)) {
          sp.set("status", "pending_leader");
          if (profile.teamName) sp.set("team", profile.teamName);
        }
      } else {
        if (status) sp.set("status", status);
        if (ownerId) sp.set("owner_id", ownerId);
        if (team) sp.set("team", team);
      }
      if (includeDeleted) sp.set("include_deleted", "true");
      const res = await fetch(`/api/settlement/deliveries?${sp.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as { deliveries?: DeliveryWithNames[]; error?: string; summary?: any };
      if (!res.ok) throw new Error(json.error ?? "출고 목록 조회 실패");
      setRows(json.deliveries ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!searchParams) return;
    const qsMonth = (searchParams.get("month") ?? "").trim();
    const qsStatus = (searchParams.get("status") ?? "").trim();
    const qsOwnerId = (searchParams.get("owner_id") ?? "").trim();
    const qsTeam = (searchParams.get("team") ?? "").trim();
    const qsSearch = (searchParams.get("search") ?? "").trim();
    const qsAllPeriod = searchParams.get("all_period") === "true";
    const qsFinancial = (searchParams.get("financial_company") ?? "").trim();
    const qsProduct = (searchParams.get("product_type") ?? "").trim();
    const qsDeliveryType = (searchParams.get("delivery_type") ?? "").trim();
    if (qsMonth) setMonth(qsMonth);
    if (qsStatus) setStatus(qsStatus);
    if (qsOwnerId) setOwnerId(qsOwnerId);
    if (qsTeam) setTeam(qsTeam);
    if (qsSearch) setSearch(qsSearch);
    if (qsAllPeriod) setAllPeriod(true);
    if (qsFinancial) setFinancialCompany(qsFinancial);
    if (qsProduct) setProductType(qsProduct);
    if (qsDeliveryType) setDeliveryType(qsDeliveryType);
  }, [searchParams]);

  useEffect(() => {
    if (!loading && profile) {
      void loadOwners();
      void loadRows();
    }
  }, [loading, profile, month, status, ownerId, team, includeDeleted, myPendingOnly, search, allPeriod, financialCompany, productType, deliveryType]);

  const teamOptions = useMemo(() => Array.from(new Set(ownerOptions.map((o) => o.team_name).filter(Boolean))) as string[], [ownerOptions]);

  const totals = useMemo(() => {
    let ag = 0;
    let dealer = 0;
    for (const r of rows) {
      ag += Number(r.ag_commission ?? 0);
      dealer += Number(r.dealer_commission ?? 0);
    }
    return { count: rows.length, ag, dealer };
  }, [rows]);

  if (loading || !profile) return <div className="py-16 text-center text-sm text-zinc-500">로딩 중…</div>;

  return (
    <div className="space-y-5">
      <header className="crm-card p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">출고 관리</h1>
          <Link href="/settlement/deliveries/new" className="crm-btn-primary">
            + 새 출고 등록
          </Link>
        </div>
      </header>

      <section className="crm-card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="crm-btn-secondary px-3 py-1.5 text-xs" onClick={() => setMonth((m) => moveMonth(m, -1))}>
            ◀
          </button>
          <span className="px-2 text-sm font-semibold">{month}</span>
          <button type="button" className="crm-btn-secondary px-3 py-1.5 text-xs" onClick={() => setMonth((m) => moveMonth(m, 1))}>
            ▶
          </button>
          <input
            className="crm-field ml-2 w-56"
            placeholder="🔍 고객명/차종/계약번호 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="inline-flex items-center gap-1 text-xs text-zinc-600">
            <input type="checkbox" checked={allPeriod} onChange={(e) => setAllPeriod(e.target.checked)} />
            전체 기간에서 검색
          </label>

          <select className="crm-field crm-field-select ml-2" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">상태: 전체</option>
            <option value="draft">draft</option>
            <option value="pending_leader">pending_leader</option>
            <option value="pending_director">pending_director</option>
            <option value="approved_director">approved_director</option>
            <option value="confirmed">confirmed</option>
            <option value="carried_over">carried_over</option>
            <option value="finalized">finalized</option>
          </select>
          <select className="crm-field crm-field-select" value={financialCompany} onChange={(e) => setFinancialCompany(e.target.value)}>
            <option value="">금융사: 전체</option>
            {FINANCE_COMPANIES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <select className="crm-field crm-field-select" value={productType} onChange={(e) => setProductType(e.target.value)}>
            <option value="">상품유형: 전체</option>
            <option value="rent">장기렌트</option>
            <option value="lease">리스</option>
          </select>
          <select className="crm-field crm-field-select" value={deliveryType} onChange={(e) => setDeliveryType(e.target.value)}>
            <option value="">출고방식: 전체</option>
            <option value="special">특판</option>
            <option value="dealer">대리점</option>
          </select>

          {showOwnerFilter ? (
            <select className="crm-field crm-field-select" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              <option value="">담당자: 전체</option>
              {ownerOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          ) : null}

          {showTeamFilter ? (
            <select className="crm-field crm-field-select" value={team} onChange={(e) => setTeam(e.target.value)}>
              <option value="">팀: 전체</option>
              {teamOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          ) : null}

          {scope.scope === "all" ? (
            <label className="ml-1 inline-flex items-center gap-1 text-xs text-zinc-600">
              <input type="checkbox" checked={includeDeleted} onChange={(e) => setIncludeDeleted(e.target.checked)} />
              삭제된 건 포함
            </label>
          ) : null}
          <label className="ml-1 inline-flex items-center gap-1 text-xs text-zinc-600">
            <input type="checkbox" checked={myPendingOnly} onChange={(e) => setMyPendingOnly(e.target.checked)} />
            내 승인 대기만 보기
          </label>

          <span className="ml-auto text-sm text-zinc-600">
            총 {totals.count}건 / AG {formatCurrency(totals.ag)} / 대리점 {formatCurrency(totals.dealer)}
          </span>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-700">
                <th className="px-3 py-2">인도일</th>
                <th className="px-3 py-2">담당자</th>
                <th className="px-3 py-2">고객명</th>
                <th className="px-3 py-2">차종</th>
                <th className="px-3 py-2">차량가</th>
                <th className="px-3 py-2">AG수수료</th>
                <th className="px-3 py-2">대리점수당</th>
                <th className="px-3 py-2">상태</th>
              </tr>
            </thead>
            <tbody>
              {busy ? (
                <tr>
                  <td className="px-3 py-4 text-zinc-500" colSpan={8}>
                    불러오는 중…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-zinc-500" colSpan={8}>
                    표시할 출고 건이 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr
                    key={r.id}
                    className="cursor-pointer border-b border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900/40"
                    onClick={() => (window.location.href = `/settlement/deliveries/${r.id}`)}
                  >
                    <td className="px-3 py-2">{r.delivery_date?.slice(5, 10)}</td>
                    <td className="px-3 py-2">{r.owner_name}</td>
                    <td className="px-3 py-2">{r.customer_name}</td>
                    <td className="px-3 py-2">{r.car_model}</td>
                    <td className="px-3 py-2">{formatCurrency(r.car_price)}</td>
                    <td className="px-3 py-2">{formatCurrency(r.ag_commission)}</td>
                    <td className="px-3 py-2">{r.dealer_commission == null ? "-" : formatCurrency(r.dealer_commission)}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass(r.status)}`}>{r.status}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
