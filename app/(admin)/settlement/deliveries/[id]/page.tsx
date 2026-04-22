/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useAuth } from "@/app/_components/auth/AuthProvider";
import { CurrencyInput } from "@/app/_components/settlement/CurrencyInput";
import { supabase } from "../../../_lib/supabaseClient";
import {
  canApproveAsDirector,
  canApproveAsLeader,
  canDeleteDelivery,
  canEditDelivery,
  canReject,
  canReopen,
  canSubmit,
  isDirector,
  resolveSubmitStatus,
} from "../../../_lib/settlement/permissions";
import { formatCurrency } from "../../../_lib/settlement/formatters";
import type { Approval, DeliveryWithNames } from "../../../_types/settlement";

type AuditRow = {
  id: string;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
  performer_name: string;
};

export default function SettlementDeliveryDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { profile, loading } = useAuth();
  const id = String(params?.id ?? "");
  const [delivery, setDelivery] = useState<DeliveryWithNames | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [form, setForm] = useState<any>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [reopenReason, setReopenReason] = useState("");

  async function getToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }

  async function loadData() {
    const token = await getToken();
    if (!token || !id) return;
    const res = await fetch(`/api/settlement/deliveries/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    const json = (await res.json()) as { delivery?: DeliveryWithNames; error?: string };
    if (!res.ok || !json.delivery) throw new Error(json.error ?? "상세 조회 실패");
    setDelivery(json.delivery);
    setForm({
      ...json.delivery,
      contract_date: json.delivery.contract_date ?? "",
      registration_date: json.delivery.registration_date ?? "",
      dealer_name: json.delivery.dealer_name ?? "",
      dealer_contract_no: json.delivery.dealer_contract_no ?? "",
      notes: json.delivery.notes ?? "",
    });

    const ar = await fetch(`/api/settlement/audit?entity_type=delivery&entity_id=${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (ar.ok) {
      const aj = (await ar.json()) as { rows?: AuditRow[] };
      setAudit(aj.rows ?? []);
    } else setAudit([]);
    const ap = await fetch(`/api/settlement/deliveries/${id}/approvals`, { headers: { Authorization: `Bearer ${token}` } });
    if (ap.ok) {
      const pj = (await ap.json()) as { rows?: Approval[] };
      setApprovals(pj.rows ?? []);
    } else setApprovals([]);
  }

  useEffect(() => {
    if (!loading && profile) {
      void loadData().catch((e) => toast.error(e instanceof Error ? e.message : "조회 실패"));
    }
  }, [id, profile?.userId, loading]);

  const canEdit = useMemo(() => {
    if (!profile || !delivery) return false;
    return canEditDelivery(
      {
        id: profile.userId,
        role: profile.role,
        rank: profile.rank,
        team_name: profile.teamName,
        email: profile.email,
      },
      delivery
    );
  }, [profile, delivery]);

  const canDelete = useMemo(() => {
    if (!profile || !delivery) return false;
    return canDeleteDelivery(
      {
        id: profile.userId,
        role: profile.role,
        rank: profile.rank,
        team_name: profile.teamName,
        email: profile.email,
      },
      delivery
    );
  }, [profile, delivery]);

  const canSubmitAction = useMemo(() => {
    if (!profile || !delivery) return false;
    return canSubmit(
      { id: profile.userId, role: profile.role, rank: profile.rank, team_name: profile.teamName, email: profile.email },
      delivery
    );
  }, [profile, delivery]);

  const canLeaderApprove = useMemo(() => {
    if (!profile || !delivery) return false;
    return canApproveAsLeader(
      { id: profile.userId, role: profile.role, rank: profile.rank, team_name: profile.teamName, email: profile.email },
      delivery
    );
  }, [profile, delivery]);

  const canDirectorApprove = useMemo(() => {
    if (!profile || !delivery) return false;
    return canApproveAsDirector(
      { id: profile.userId, role: profile.role, rank: profile.rank, team_name: profile.teamName, email: profile.email },
      delivery
    );
  }, [profile, delivery]);

  const canRejectAction = useMemo(() => {
    if (!profile || !delivery) return false;
    return canReject(
      { id: profile.userId, role: profile.role, rank: profile.rank, team_name: profile.teamName, email: profile.email },
      delivery
    );
  }, [profile, delivery]);

  const canReopenAction = useMemo(() => {
    if (!profile || !delivery) return false;
    return canReopen(
      { id: profile.userId, role: profile.role, rank: profile.rank, team_name: profile.teamName, email: profile.email },
      delivery
    );
  }, [profile, delivery]);

  if (loading || !profile) return <div className="py-16 text-center text-sm text-zinc-500">로딩 중…</div>;
  if (!delivery || !form) return <div className="py-16 text-center text-sm text-zinc-500">데이터가 없습니다.</div>;

  async function save() {
    setSaving(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("로그인이 필요합니다.");
      const res = await fetch(`/api/settlement/deliveries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          version: Number(form.version ?? 1),
          financial_company: form.financial_company,
          product_type: form.product_type,
          contract_date: form.contract_date || null,
          delivery_date: form.delivery_date,
          registration_date: form.registration_date || null,
          customer_name: form.customer_name,
          car_model: form.car_model,
          car_price: form.car_price,
          ag_commission: form.ag_commission,
          etc_revenue: form.etc_revenue,
          customer_support: form.customer_support,
          delivery_type: form.delivery_type,
          dealer_name: form.delivery_type === "dealer" ? form.dealer_name || null : null,
          dealer_contract_no: form.delivery_type === "dealer" ? form.dealer_contract_no || null : null,
          notes: form.notes || null,
        }),
      });
      const json = (await res.json()) as { delivery?: DeliveryWithNames; error?: string };
      if (!res.ok || !json.delivery) throw new Error(json.error ?? "저장 실패");
      toast.success("저장되었습니다.");
      setEditing(false);
      await loadData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm("정말 삭제하시겠습니까? 이 작업은 소프트 삭제이며 복구 가능합니다.")) return;
    try {
      const token = await getToken();
      if (!token) throw new Error("로그인이 필요합니다.");
      const res = await fetch(`/api/settlement/deliveries/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) throw new Error(json.error ?? "삭제 실패");
      toast.success("삭제되었습니다.");
      router.replace("/settlement/deliveries");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "삭제 실패");
    }
  }

  async function runAction(path: string, body: Record<string, unknown>, success: string) {
    try {
      const token = await getToken();
      if (!token) throw new Error("로그인이 필요합니다.");
      const res = await fetch(`/api/settlement/deliveries/${id}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "처리에 실패했습니다.");
      toast.success(success);
      await loadData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "처리 실패");
    }
  }

  function approvalColor(action: string) {
    if (action === "approve") return "text-emerald-600";
    if (action === "reject") return "text-red-600";
    if (action === "reopen") return "text-amber-600";
    return "text-zinc-600";
  }

  const nextHint =
    delivery.status === "pending_leader"
      ? "→ 팀장 승인 대기"
      : delivery.status === "pending_director"
        ? "→ 본부장 승인 대기"
        : delivery.status === "approved_director"
          ? "→ 모딜카 제출 대기"
          : "→ 제출 대기";

  const submitStatus = resolveSubmitStatus({
    id: delivery.owner_id,
    role: "",
    rank: (delivery as any).owner_rank,
    team_name: delivery.team_name,
    email: delivery.owner_email,
  });

  return (
    <div className="space-y-6">
      <header className="crm-card p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">출고 상세</h1>
            <div className="mt-2 text-sm text-zinc-600">
              담당자: {delivery.owner_name} ({delivery.team_name ?? "팀없음"}) · 등록자: {delivery.created_by_name}
            </div>
            <div className="text-sm text-zinc-500">등록일시: {new Date(delivery.created_at).toLocaleString("ko-KR")}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700">{delivery.status}</span>
            <span className="text-xs text-zinc-500">{nextHint}</span>
            {canSubmitAction ? (
              <button type="button" className="crm-btn-secondary px-3 py-1.5 text-xs" onClick={() => setSubmitOpen(true)}>
                제출
              </button>
            ) : null}
            {canLeaderApprove || canDirectorApprove ? (
              <button
                type="button"
                className="crm-btn-secondary px-3 py-1.5 text-xs"
                onClick={() => void runAction("approve", { version: delivery.version }, "승인되었습니다.")}
              >
                {canDirectorApprove && isDirector(profile) ? "본부장 승인" : "팀장 승인"}
              </button>
            ) : null}
            {canRejectAction ? (
              <button type="button" className="crm-btn-secondary px-3 py-1.5 text-xs text-red-600" onClick={() => setRejectOpen(true)}>
                반려
              </button>
            ) : null}
            {canReopenAction ? (
              <button type="button" className="crm-btn-secondary px-3 py-1.5 text-xs text-amber-600" onClick={() => setReopenOpen(true)}>
                재오픈
              </button>
            ) : null}
            {canEdit ? (
              <button type="button" className="crm-btn-secondary px-3 py-1.5 text-xs" onClick={() => setEditing((v) => !v)}>
                {editing ? "조회 모드" : "수정"}
              </button>
            ) : null}
            {canDelete ? (
              <button type="button" className="crm-btn-secondary px-3 py-1.5 text-xs" onClick={() => void remove()}>
                삭제
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <section className="crm-card p-5 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">금융사
            <input className="crm-field mt-1" disabled={!editing} value={form.financial_company} onChange={(e) => setForm((p: any) => ({ ...p, financial_company: e.target.value }))} />
          </label>
          <label className="text-sm">상품유형
            <select className="crm-field crm-field-select mt-1" disabled={!editing} value={form.product_type} onChange={(e) => setForm((p: any) => ({ ...p, product_type: e.target.value }))}>
              <option value="rent">장기렌트</option>
              <option value="lease">리스</option>
            </select>
          </label>
          <label className="text-sm">인도일자
            <input className="crm-field mt-1" type="date" disabled={!editing} value={form.delivery_date} onChange={(e) => setForm((p: any) => ({ ...p, delivery_date: e.target.value }))} />
          </label>
          <label className="text-sm">고객명
            <input className="crm-field mt-1" disabled={!editing} value={form.customer_name} onChange={(e) => setForm((p: any) => ({ ...p, customer_name: e.target.value }))} />
          </label>
          <label className="text-sm">차종
            <input className="crm-field mt-1" disabled={!editing} value={form.car_model} onChange={(e) => setForm((p: any) => ({ ...p, car_model: e.target.value }))} />
          </label>
          <label className="text-sm">차량가
            {editing ? (
              <CurrencyInput value={form.car_price} onChange={(v) => setForm((p: any) => ({ ...p, car_price: v }))} />
            ) : (
              <div className="mt-2 text-sm font-semibold">{formatCurrency(form.car_price)}</div>
            )}
          </label>
          <label className="text-sm">AG 수수료
            {editing ? (
              <CurrencyInput value={form.ag_commission} onChange={(v) => setForm((p: any) => ({ ...p, ag_commission: v }))} />
            ) : (
              <div className="mt-2 text-sm font-semibold">{formatCurrency(form.ag_commission)}</div>
            )}
          </label>
          <label className="text-sm">고객 지원금
            {editing ? (
              <CurrencyInput value={form.customer_support} onChange={(v) => setForm((p: any) => ({ ...p, customer_support: v }))} />
            ) : (
              <div className="mt-2 text-sm font-semibold">{formatCurrency(form.customer_support)}</div>
            )}
          </label>
          <label className="text-sm">기타 수익
            {editing ? (
              <CurrencyInput value={form.etc_revenue} onChange={(v) => setForm((p: any) => ({ ...p, etc_revenue: v }))} />
            ) : (
              <div className="mt-2 text-sm font-semibold">{formatCurrency(form.etc_revenue)}</div>
            )}
          </label>
          <label className="text-sm">
            대리점 수당
            <div className="mt-2 rounded-md bg-zinc-100 px-3 py-2 text-sm text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
              {delivery.dealer_commission == null ? "미정 (정산 후 입력)" : formatCurrency(delivery.dealer_commission)}
            </div>
          </label>
          <label className="text-sm">출고 방식
            <select className="crm-field crm-field-select mt-1" disabled={!editing} value={form.delivery_type} onChange={(e) => setForm((p: any) => ({ ...p, delivery_type: e.target.value }))}>
              <option value="special">특판</option>
              <option value="dealer">대리점</option>
            </select>
          </label>
          <label className="text-sm">대리점명
            <input className="crm-field mt-1" disabled={!editing || form.delivery_type !== "dealer"} value={form.dealer_name} onChange={(e) => setForm((p: any) => ({ ...p, dealer_name: e.target.value }))} />
          </label>
          <label className="text-sm">대리점 계약번호
            <input className="crm-field mt-1" disabled={!editing || form.delivery_type !== "dealer"} value={form.dealer_contract_no} onChange={(e) => setForm((p: any) => ({ ...p, dealer_contract_no: e.target.value }))} />
          </label>
          <label className="text-sm sm:col-span-2">특이사항
            <textarea className="crm-field mt-1 min-h-[88px]" disabled={!editing} value={form.notes} onChange={(e) => setForm((p: any) => ({ ...p, notes: e.target.value }))} />
          </label>
        </div>
        {editing ? (
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="crm-btn-secondary" onClick={() => setEditing(false)}>
              취소
            </button>
            <button type="button" className="crm-btn-primary" disabled={saving} onClick={() => void save()}>
              {saving ? "저장 중…" : "저장"}
            </button>
          </div>
        ) : null}
      </section>

      <section className="crm-card p-5 sm:p-6">
        <h2 className="text-base font-semibold">승인 이력</h2>
        <div className="mt-3 space-y-2">
          {approvals.length === 0 ? (
            <div className="text-sm text-zinc-500">승인 이력이 없습니다.</div>
          ) : (
            approvals.map((a) => (
              <div key={a.id} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700">
                <div className="font-medium">{new Date(a.created_at).toLocaleString("ko-KR")}</div>
                <div className={approvalColor(a.action)}>
                  {a.approver_name} ({a.approver_rank || "-"}) · {a.action}
                </div>
                {a.notes ? <div className="mt-1 text-xs text-zinc-600">사유: {a.notes}</div> : null}
              </div>
            ))
          )}
        </div>
      </section>

      <section className="crm-card p-5 sm:p-6">
        <h2 className="text-base font-semibold">변경 이력</h2>
        <div className="mt-3 space-y-2">
          {audit.length === 0 ? (
            <div className="text-sm text-zinc-500">이력이 없습니다.</div>
          ) : (
            audit.map((a) => (
              <div key={a.id} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700">
                <div className="font-medium">{new Date(a.created_at).toLocaleString("ko-KR")} · {a.performer_name} · {a.action}</div>
                {a.details?.changed_fields ? (
                  <div className="mt-1 text-xs text-zinc-600">변경 필드: {String((a.details as any).changed_fields?.join(", ") ?? "")}</div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </section>
      {submitOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 dark:bg-zinc-900">
            <h3 className="text-base font-semibold">이 출고건을 제출하시겠습니까?</h3>
            <div className="mt-3 text-sm text-zinc-600">
              담당자: {delivery.owner_name} ({(delivery as any).owner_rank ?? "-"})
            </div>
            <div className="text-sm text-zinc-600">예상 라우팅: {submitStatus}</div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="crm-btn-secondary" onClick={() => setSubmitOpen(false)}>
                취소
              </button>
              <button
                type="button"
                className="crm-btn-primary"
                onClick={async () => {
                  await runAction("submit", { version: delivery.version }, "제출되었습니다.");
                  setSubmitOpen(false);
                }}
              >
                제출
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {rejectOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 dark:bg-zinc-900">
            <h3 className="text-base font-semibold">이 출고건을 반려하시겠습니까?</h3>
            <textarea
              className="crm-field mt-3 min-h-[96px]"
              placeholder="반려 사유를 입력하세요 (필수)"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="crm-btn-secondary" onClick={() => setRejectOpen(false)}>
                취소
              </button>
              <button
                type="button"
                className="crm-btn-primary"
                onClick={async () => {
                  await runAction("reject", { version: delivery.version, reason: rejectReason }, "반려되었습니다.");
                  setRejectReason("");
                  setRejectOpen(false);
                }}
              >
                반려
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {reopenOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 dark:bg-zinc-900">
            <h3 className="text-base font-semibold">이 출고건을 재오픈하시겠습니까?</h3>
            <div className="mt-3 text-sm text-zinc-600">현재 상태: {delivery.status} → pending_director</div>
            <textarea
              className="crm-field mt-3 min-h-[96px]"
              placeholder="재오픈 사유를 입력하세요 (필수)"
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="crm-btn-secondary" onClick={() => setReopenOpen(false)}>
                취소
              </button>
              <button
                type="button"
                className="crm-btn-primary"
                onClick={async () => {
                  await runAction("reopen", { version: delivery.version, reason: reopenReason }, "재오픈되었습니다.");
                  setReopenReason("");
                  setReopenOpen(false);
                }}
              >
                재오픈
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
