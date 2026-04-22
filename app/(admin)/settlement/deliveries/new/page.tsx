"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useAuth } from "@/app/_components/auth/AuthProvider";
import { CurrencyInput } from "@/app/_components/settlement/CurrencyInput";
import { OwnerSelect, type OwnerOption } from "@/app/_components/settlement/OwnerSelect";
import { supabase } from "../../../_lib/supabaseClient";
import { getDeliveryScope } from "../../../_lib/settlement/permissions";

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
  "기타",
];

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function NewSettlementDeliveryPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const [owners, setOwners] = useState<OwnerOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [financeEtc, setFinanceEtc] = useState("");
  const [form, setForm] = useState({
    owner_id: "",
    contract_date: "",
    delivery_date: todayYmd(),
    registration_date: "",
    customer_name: "",
    car_model: "",
    car_price: 0,
    financial_company: "현대캐피탈",
    product_type: "rent" as "rent" | "lease",
    delivery_type: "special" as "special" | "dealer",
    dealer_name: "",
    dealer_contract_no: "",
    ag_commission: 0,
    customer_support: 0,
    etc_revenue: 0,
    notes: "",
  });

  async function getToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }

  useEffect(() => {
    if (!profile) return;
    void (async () => {
      const token = await getToken();
      if (!token) return;
      const res = await fetch("/api/settlement/deliveries/available-owners", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as { owners?: OwnerOption[] };
      const opts = json.owners ?? [];
      setOwners(opts);
      const scope = getDeliveryScope({
        id: profile.userId,
        role: profile.role,
        rank: profile.rank,
        team_name: profile.teamName,
        email: profile.email,
      });
      if (scope.scope === "own") {
        setForm((p) => ({ ...p, owner_id: profile.userId }));
      } else if (scope.scope === "team") {
        setForm((p) => ({ ...p, owner_id: profile.userId }));
      }
    })();
  }, [profile?.userId]);

  if (loading || !profile) return <div className="py-16 text-center text-sm text-zinc-500">로딩 중…</div>;

  async function submit() {
    if (!form.owner_id) return toast.error("담당자를 선택해 주세요.");
    if (!form.delivery_date) return toast.error("인도일자를 입력해 주세요.");
    if (!form.customer_name.trim()) return toast.error("고객명을 입력해 주세요.");
    if (!form.car_model.trim()) return toast.error("차종을 입력해 주세요.");
    if (form.car_price < 0 || form.ag_commission < 0) return toast.error("금액은 0 이상이어야 합니다.");
    if (form.delivery_type === "dealer" && !form.dealer_name.trim()) return toast.error("대리점 출고는 대리점명이 필수입니다.");

    setSaving(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("로그인이 필요합니다.");
      const financial_company = form.financial_company === "기타" ? financeEtc.trim() || "기타" : form.financial_company;
      const res = await fetch("/api/settlement/deliveries", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...form,
          financial_company,
          contract_date: form.contract_date || null,
          registration_date: form.registration_date || null,
          dealer_name: form.delivery_type === "dealer" ? form.dealer_name.trim() : null,
          dealer_contract_no: form.delivery_type === "dealer" ? form.dealer_contract_no.trim() || null : null,
          notes: form.notes.trim() || null,
        }),
      });
      const json = (await res.json()) as { delivery?: { id: string }; error?: string; warning?: string | null };
      if (!res.ok || !json.delivery) throw new Error(json.error ?? "등록 실패");
      if (json.warning) toast(json.warning);
      toast.success("출고 건이 등록되었습니다.");
      router.replace(`/settlement/deliveries/${json.delivery.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "등록 실패");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="crm-card p-5 sm:p-6">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">새 출고 등록</h1>
      </header>

      <section className="crm-card space-y-6 p-5 sm:p-6">
        <div>
          <h2 className="text-base font-semibold">기본 정보</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              담당자 *
              <OwnerSelect value={form.owner_id} onChange={(v) => setForm((p) => ({ ...p, owner_id: v }))} options={owners} />
            </label>
            <label className="text-sm">
              계약일자
              <input className="crm-field mt-1" type="date" value={form.contract_date} onChange={(e) => setForm((p) => ({ ...p, contract_date: e.target.value }))} />
            </label>
            <label className="text-sm">
              인도일자 *
              <input className="crm-field mt-1" type="date" value={form.delivery_date} onChange={(e) => setForm((p) => ({ ...p, delivery_date: e.target.value }))} />
            </label>
            <label className="text-sm">
              차량등록일자
              <input className="crm-field mt-1" type="date" value={form.registration_date} onChange={(e) => setForm((p) => ({ ...p, registration_date: e.target.value }))} />
            </label>
          </div>
        </div>

        <div>
          <h2 className="text-base font-semibold">고객·차량</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              고객명 *
              <input className="crm-field mt-1" value={form.customer_name} onChange={(e) => setForm((p) => ({ ...p, customer_name: e.target.value }))} />
            </label>
            <label className="text-sm">
              차종 *
              <input className="crm-field mt-1" value={form.car_model} onChange={(e) => setForm((p) => ({ ...p, car_model: e.target.value }))} />
            </label>
            <label className="text-sm sm:col-span-2">
              차량가 *
              <CurrencyInput value={form.car_price} onChange={(v) => setForm((p) => ({ ...p, car_price: v }))} />
            </label>
          </div>
        </div>

        <div>
          <h2 className="text-base font-semibold">금융·출고</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              금융사 *
              <select className="crm-field crm-field-select mt-1" value={form.financial_company} onChange={(e) => setForm((p) => ({ ...p, financial_company: e.target.value }))}>
                {FINANCE_COMPANIES.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
              {form.financial_company === "기타" ? (
                <input className="crm-field mt-2" placeholder="금융사 직접 입력" value={financeEtc} onChange={(e) => setFinanceEtc(e.target.value)} />
              ) : null}
            </label>
            <label className="text-sm">
              상품유형 *
              <div className="mt-2 flex gap-4">
                <label className="inline-flex items-center gap-1"><input type="radio" checked={form.product_type === "rent"} onChange={() => setForm((p) => ({ ...p, product_type: "rent" }))} />장기렌트</label>
                <label className="inline-flex items-center gap-1"><input type="radio" checked={form.product_type === "lease"} onChange={() => setForm((p) => ({ ...p, product_type: "lease" }))} />리스</label>
              </div>
            </label>
            <label className="text-sm sm:col-span-2">
              출고 방식 *
              <div className="mt-2 flex gap-4">
                <label className="inline-flex items-center gap-1"><input type="radio" checked={form.delivery_type === "special"} onChange={() => setForm((p) => ({ ...p, delivery_type: "special" }))} />특판</label>
                <label className="inline-flex items-center gap-1"><input type="radio" checked={form.delivery_type === "dealer"} onChange={() => setForm((p) => ({ ...p, delivery_type: "dealer" }))} />대리점</label>
              </div>
            </label>
            {form.delivery_type === "dealer" ? (
              <>
                <label className="text-sm">
                  대리점명 *
                  <input className="crm-field mt-1" value={form.dealer_name} onChange={(e) => setForm((p) => ({ ...p, dealer_name: e.target.value }))} />
                </label>
                <label className="text-sm">
                  대리점 계약번호
                  <input className="crm-field mt-1" value={form.dealer_contract_no} onChange={(e) => setForm((p) => ({ ...p, dealer_contract_no: e.target.value }))} />
                </label>
              </>
            ) : null}
          </div>
        </div>

        <div>
          <h2 className="text-base font-semibold">수익 정보</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              AG 수수료 *
              <CurrencyInput value={form.ag_commission} onChange={(v) => setForm((p) => ({ ...p, ag_commission: v }))} />
            </label>
            <label className="text-sm">
              고객 지원금
              <CurrencyInput value={form.customer_support} onChange={(v) => setForm((p) => ({ ...p, customer_support: v }))} />
            </label>
            <label className="text-sm">
              기타 수익
              <CurrencyInput value={form.etc_revenue} onChange={(v) => setForm((p) => ({ ...p, etc_revenue: v }))} />
            </label>
            <div className="text-sm text-zinc-500">대리점 수당은 추후 입력됩니다.</div>
          </div>
        </div>

        <div>
          <h2 className="text-base font-semibold">기타</h2>
          <textarea className="crm-field mt-2 min-h-[90px]" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" className="crm-btn-secondary" onClick={() => router.back()}>
            취소
          </button>
          <button type="button" className="crm-btn-primary" disabled={saving} onClick={() => void submit()}>
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </section>
    </div>
  );
}
