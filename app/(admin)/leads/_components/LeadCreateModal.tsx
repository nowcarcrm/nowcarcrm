"use client";

import { useMemo, useState } from "react";
import type { CustomerBase, Lead, LeadCategoryKey } from "../../_lib/leaseCrmTypes";
import { LEAD_SOURCE_OPTIONS, defaultLeadOperationalFields } from "../../_lib/leaseCrmTypes";
import { leadBootstrapForCategory } from "../../_lib/leaseCrmLogic";
import toast from "react-hot-toast";

type OwnerOption = { id: string; name: string };

type DraftBase = Pick<
  CustomerBase,
  "name" | "phone" | "desiredVehicle" | "source" | "ownerStaff"
>;

export default function LeadCreateModal({
  onClose,
  onCreate,
  ownerOptions,
  defaultOwnerId,
  defaultOwner,
  categoryKey,
  categoryLabel,
  canAssignOwner = true,
  lockedOwnerDisplayName = "",
}: {
  onClose: () => void;
  onCreate: (lead: Lead) => Promise<Lead>;
  ownerOptions: OwnerOption[];
  defaultOwnerId?: string;
  defaultOwner?: string;
  categoryKey: LeadCategoryKey;
  categoryLabel: string;
  /** false면 담당 직원은 lockedOwnerDisplayName만 사용(직원 계정) */
  canAssignOwner?: boolean;
  lockedOwnerDisplayName?: string;
}) {
  const initialOwner = canAssignOwner
    ? (defaultOwner ?? ownerOptions[0]?.name ?? "")
    : (lockedOwnerDisplayName || defaultOwner || "").trim();
  const initialOwnerId = canAssignOwner
    ? (defaultOwnerId ?? ownerOptions[0]?.id ?? "")
    : "";
  const [draft, setDraft] = useState<DraftBase>({
    name: "",
    phone: "",
    desiredVehicle: "",
    source: "",
    ownerStaff: initialOwner,
  });
  const [selectedUserId, setSelectedUserId] = useState<string>(initialOwnerId);
  const [error, setError] = useState<string | null>(null);

  const nowIso = useMemo(() => new Date().toISOString(), []);
  const bootstrap = useMemo(
    () => leadBootstrapForCategory(categoryKey, nowIso),
    [categoryKey, nowIso]
  );

  function validate() {
    if (!draft.name.trim()) return "고객명을 입력해주세요.";
    if (!draft.phone.trim()) return "연락처를 입력해주세요.";
    if (!draft.desiredVehicle.trim()) return "원하는 차종을 입력해주세요.";
    if (!draft.source.trim()) return "유입 경로를 선택해주세요.";
    if (canAssignOwner && !draft.ownerStaff.trim()) return "담당 직원을 입력해주세요.";
    if (canAssignOwner && !selectedUserId) return "담당 직원 ID를 선택해주세요.";
    if (!canAssignOwner && !lockedOwnerDisplayName.trim()) return "로그인 사용자 정보를 확인할 수 없습니다.";
    return null;
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="crm-modal-panel max-w-lg">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-base font-semibold text-[var(--crm-accent)] dark:text-zinc-50">
                고객 빠른 등록
              </div>
              <div className="mt-1 text-sm text-[var(--crm-accent-muted)] dark:text-zinc-400">
                진행단계「{categoryLabel}」· 상담결과{" "}
                <span className="font-semibold text-[var(--crm-blue)] dark:text-sky-300">
                  {bootstrap.counselingStatus}
                </span>
                로 등록됩니다. 고객 온도·계약기간 등은 상세에서 입력하세요.
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900/60"
              aria-label="모달 닫기"
            >
              ✕
            </button>
          </div>

          {error ? (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
              {error}
            </div>
          ) : null}

          <form
            className="mt-5 grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              console.log("selectedUserId:", selectedUserId);
              const v = validate();
              if (v) {
                setError(v);
                return;
              }
              const id =
                typeof crypto !== "undefined" && "randomUUID" in crypto
                  ? crypto.randomUUID()
                  : `lead_${Math.random().toString(16).slice(2)}`;
              const ownerStaff = canAssignOwner
                ? draft.ownerStaff.trim()
                : lockedOwnerDisplayName.trim();
              const base: CustomerBase = {
                name: draft.name.trim(),
                phone: draft.phone.trim(),
                desiredVehicle: draft.desiredVehicle.trim(),
                source: draft.source.trim(),
                leadTemperature: "중",
                customerType: "개인",
                wantedMonthlyPayment: 0,
                contractTerm: "36개월",
                hasDepositOrPrepayment: false,
                depositOrPrepaymentAmount: "",
                ownerStaff,
                memo: "",
              };
              const lead: Lead = {
                id,
                createdAt: nowIso,
                updatedAt: nowIso,
                base,
                counselingStatus: bootstrap.counselingStatus,
                statusUpdatedAt: nowIso,
                nextContactAt: bootstrap.nextContactAt,
                nextContactMemo: bootstrap.nextContactMemo,
                counselingRecords: [],
                contract: bootstrap.contract,
                exportProgress: bootstrap.exportProgress,
                deliveredAt: bootstrap.deliveredAt,
                lastHandledAt: nowIso,
                managerUserId: selectedUserId || undefined,
                ...defaultLeadOperationalFields(),
              };
              console.log("[LeadCreateModal] submit lead payload(full)", lead);
              void (async () => {
                try {
                  setError(null);
                  await onCreate(lead);
                  setError(null);
                } catch (err) {
                  const message =
                    err instanceof Error ? err.message : "고객 저장에 실패했습니다.";
                  setError(message);
                  toast.error(message);
                }
              })();
            }}
          >
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-[var(--crm-accent-muted)] dark:text-zinc-400">
                고객명
              </label>
              <input
                value={draft.name}
                onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
                className="crm-field"
                placeholder="예: 김민지"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-[var(--crm-accent-muted)] dark:text-zinc-400">
                연락처
              </label>
              <input
                value={draft.phone}
                onChange={(e) => setDraft((p) => ({ ...p, phone: e.target.value }))}
                className="crm-field"
                placeholder="예: 010-1234-5678"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-[var(--crm-accent-muted)] dark:text-zinc-400">
                원하는 차종
              </label>
              <input
                value={draft.desiredVehicle}
                onChange={(e) => setDraft((p) => ({ ...p, desiredVehicle: e.target.value }))}
                className="crm-field"
                placeholder="예: 쏘나타, 그랜저 등"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-[var(--crm-accent-muted)] dark:text-zinc-400">
                유입 경로
              </label>
              <select
                value={draft.source}
                onChange={(e) => setDraft((p) => ({ ...p, source: e.target.value }))}
                className="crm-field crm-field-select"
              >
                <option value="">선택</option>
                {LEAD_SOURCE_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-[var(--crm-accent-muted)] dark:text-zinc-400">
                담당 직원
              </label>
              {canAssignOwner ? (
                <select
                  value={selectedUserId}
                  onChange={(e) => {
                    const uid = e.target.value;
                    const selected = ownerOptions.find((x) => x.id === uid);
                    setSelectedUserId(uid);
                    setDraft((p) => ({ ...p, ownerStaff: selected?.name ?? p.ownerStaff }));
                  }}
                  className="crm-field crm-field-select"
                >
                  <option value="" disabled>
                    담당 직원을 선택하세요
                  </option>
                  {ownerOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  readOnly
                  disabled
                  value={lockedOwnerDisplayName}
                  className="crm-field cursor-not-allowed opacity-90 dark:opacity-95"
                  title="직원 계정은 본인만 담당으로 등록됩니다."
                />
              )}
            </div>

            <div className="sm:col-span-2 flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="crm-btn-secondary"
              >
                취소
              </button>
              <button type="submit" className="crm-btn-primary">
                저장
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
