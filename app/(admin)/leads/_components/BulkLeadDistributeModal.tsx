"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TapButton } from "@/app/_components/ui/crm-motion";
import { LEAD_SOURCE_OPTIONS } from "../../_lib/leaseCrmTypes";
import { listActiveUsers, type UserRow } from "../../_lib/usersSupabase";
import { isSuperAdmin } from "../../_lib/rolePermissions";
import { supabase } from "../../_lib/supabaseClient";
import toast from "react-hot-toast";
import {
  formatKoreanMobile,
  isValidKoreanMobile010,
} from "../../_lib/bulkLeadPhone";

const SLOT_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "선택 안 함" },
  { value: "09-12", label: "09시~12시" },
  { value: "12-15", label: "12시~15시" },
  { value: "15-18", label: "15시~18시" },
];

type BulkProfile = {
  userId: string;
  role: string;
  rank?: string | null;
  email?: string | null;
  teamName?: string | null;
  name?: string | null;
};

type RowModel = {
  key: string;
  name: string;
  phone: string;
  desiredCar: string;
  source: string;
  sourceOther: string;
  managerUserId: string;
  consultationTimeSlot: string;
  duplicateChoice: "skip" | "force";
};

function newRowKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `r_${Math.random().toString(16).slice(2)}`;
}

function emptyRow(): RowModel {
  return {
    key: newRowKey(),
    name: "",
    phone: "",
    desiredCar: "",
    source: "",
    sourceOther: "",
    managerUserId: "",
    consultationTimeSlot: "",
    duplicateChoice: "skip",
  };
}

function fiveRows(): RowModel[] {
  return [emptyRow(), emptyRow(), emptyRow(), emptyRow(), emptyRow()];
}

function rowIsBlank(r: RowModel): boolean {
  return (
    !r.name.trim() &&
    !r.phone.trim() &&
    !r.desiredCar.trim() &&
    !r.source.trim() &&
    !r.managerUserId &&
    !r.consultationTimeSlot
  );
}

function rowIsActive(r: RowModel): boolean {
  return !rowIsBlank(r);
}

function resolvedSource(r: RowModel): string {
  if (r.source === "기타") return (r.sourceOther.trim() || "기타").slice(0, 200);
  return (r.source || "").trim().slice(0, 200);
}

export default function BulkLeadDistributeModal({
  open,
  onClose,
  profile,
  onDistributed,
}: {
  open: boolean;
  onClose: () => void;
  profile: BulkProfile | null;
  onDistributed?: () => void | Promise<void>;
}) {
  const [rows, setRows] = useState<RowModel[]>(fiveRows);
  const [userOptions, setUserOptions] = useState<UserRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorRows, setErrorRows] = useState<Set<string>>(new Set());
  const [duplicatePhones, setDuplicatePhones] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<"edit" | "duplicates" | "done">("edit");
  const [successLines, setSuccessLines] = useState<string[]>([]);
  const [successTotal, setSuccessTotal] = useState(0);

  const assignableUsers = useMemo(() => {
    return userOptions.filter((u) => {
      const r = (u.rank ?? "").trim();
      if (r === "총괄대표") return false;
      if (isSuperAdmin({ id: u.id, email: u.email, role: u.role, rank: u.rank })) return false;
      return true;
    });
  }, [userOptions]);

  useEffect(() => {
    if (!open || !profile) return;
    let cancelled = false;
    setLoadingUsers(true);
    void listActiveUsers({
      id: profile.userId,
      role: profile.role,
      rank: profile.rank ?? null,
      email: profile.email ?? null,
      team_name: profile.teamName ?? null,
    })
      .then((list) => {
        if (!cancelled) setUserOptions(list);
      })
      .catch(() => {
        if (!cancelled) setUserOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingUsers(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, profile]);

  const resetForm = useCallback(() => {
    setRows(fiveRows());
    setErrorRows(new Set());
    setDuplicatePhones(new Set());
    setStep("edit");
    setSuccessLines([]);
    setSuccessTotal(0);
  }, []);

  useEffect(() => {
    if (!open) return;
    resetForm();
  }, [open, resetForm]);

  const validateActiveRows = useCallback(() => {
    const nextErr = new Set<string>();
    for (const r of rows) {
      if (!rowIsActive(r)) continue;
      const phone = formatKoreanMobile(r.phone).trim();
      const ok =
        !!r.name.trim() &&
        isValidKoreanMobile010(phone) &&
        !!r.managerUserId &&
        (!r.source || r.source !== "기타" || !!r.sourceOther.trim());
      if (!ok) nextErr.add(r.key);
    }
    setErrorRows(nextErr);
    return nextErr.size === 0;
  }, [rows]);

  const activeRows = useMemo(() => rows.filter(rowIsActive), [rows]);

  const fetchDuplicatePhones = useCallback(async (): Promise<Set<string> | null> => {
    const phones = activeRows
      .map((r) => formatKoreanMobile(r.phone).trim())
      .filter((p) => isValidKoreanMobile010(p));
    if (phones.length === 0) return new Set();
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        toast.error("로그인이 필요합니다.");
        return null;
      }
      const res = await fetch("/api/leads/bulk-check-phones", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ phones }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        existing?: Array<{ phone: string }>;
        error?: string;
      };
      if (!res.ok) {
        toast.error(json.error ?? "중복 확인에 실패했습니다.");
        return null;
      }
      return new Set((json.existing ?? []).map((e) => e.phone.trim()).filter(Boolean));
    } catch {
      toast.error("중복 확인에 실패했습니다.");
      return null;
    }
  }, [activeRows]);

  const distribute = useCallback(
    async (dupSet: Set<string>) => {
      if (!profile) return;
      const payloadLeads = activeRows.map((r) => {
        const phone = formatKoreanMobile(r.phone).trim();
        const dup = dupSet.has(phone);
        const skipDuplicate = dup && r.duplicateChoice === "skip";
        const slot = r.consultationTimeSlot.trim() || null;
        return {
          name: r.name.trim(),
          phone,
          desiredCar: r.desiredCar.trim(),
          source: resolvedSource(r),
          managerUserId: r.managerUserId,
          consultationTimeSlot: slot,
          skipDuplicate,
        };
      });
      if (payloadLeads.length === 0) {
        toast.error("등록할 행이 없습니다.");
        return;
      }
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        toast.error("로그인이 필요합니다.");
        return;
      }
      const res = await fetch("/api/leads/bulk-distribute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ leads: payloadLeads }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        distributedCount?: number;
        perUser?: Record<string, { name: string; rank: string; count: number }>;
        error?: string;
      };
      if (!res.ok || !json.success) {
        toast.error(json.error ?? "배포에 실패했습니다.");
        return;
      }
      const n = json.distributedCount ?? 0;
      const lines = Object.values(json.perUser ?? {}).map((v) => {
        const label = v.rank ? `${v.name} ${v.rank}` : v.name;
        return `- ${label}: ${v.count}명`;
      });
      setSuccessTotal(n);
      setSuccessLines(lines);
      setStep("done");
      toast.success(`총 ${n}명 배포 완료`);
      await onDistributed?.();
    },
    [activeRows, onDistributed, profile]
  );

  const handleSaveClick = useCallback(async () => {
    if (!validateActiveRows()) {
      toast.error("입력 오류가 있는 행을 확인해 주세요.");
      return;
    }
    if (activeRows.length === 0) {
      toast.error("최소 한 행 이상 입력해 주세요.");
      return;
    }
    setSubmitting(true);
    try {
      const dup = await fetchDuplicatePhones();
      if (dup === null) return;
      setDuplicatePhones(dup);
      if (dup.size > 0) {
        setRows((prev) =>
          prev.map((r) => {
            const p = formatKoreanMobile(r.phone).trim();
            if (dup.has(p)) return { ...r, duplicateChoice: "skip" as const };
            return r;
          })
        );
        setStep("duplicates");
        return;
      }
      await distribute(dup);
    } finally {
      setSubmitting(false);
    }
  }, [activeRows.length, distribute, fetchDuplicatePhones, validateActiveRows]);

  const handleConfirmDuplicates = useCallback(async () => {
    setSubmitting(true);
    try {
      await distribute(duplicatePhones);
    } finally {
      setSubmitting(false);
    }
  }, [distribute, duplicatePhones]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/45 backdrop-blur-[1px]" onClick={onClose} aria-hidden="true" />
      <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto p-4">
        <div
          className="crm-modal-panel relative w-full max-w-6xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 border-b border-zinc-200 pb-4 dark:border-zinc-700">
            <div>
              <h2 className="text-lg font-semibold text-[var(--crm-accent)] dark:text-zinc-50">대량 디비 배포</h2>
              <p className="mt-1 text-sm text-[var(--crm-accent-muted)] dark:text-zinc-400">
                여러 고객을 한 번에 등록하고 담당 직원에게 배정합니다.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900/60"
              aria-label="닫기"
            >
              ✕
            </button>
          </div>

          {step === "done" ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/90 px-4 py-4 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
                <p className="font-semibold">✅ 총 {successTotal}명의 고객이 성공적으로 배포되었습니다.</p>
                {successLines.length > 0 ? (
                  <div className="mt-3 whitespace-pre-line">
                    <span className="font-medium">직원별 배정:</span>
                    {"\n"}
                    {successLines.join("\n")}
                  </div>
                ) : null}
              </div>
              <div className="flex justify-end gap-2">
                <TapButton
                  type="button"
                  className="crm-btn-primary"
                  onClick={() => {
                    resetForm();
                    onClose();
                  }}
                >
                  닫기
                </TapButton>
              </div>
            </div>
          ) : step === "duplicates" ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                이미 등록된 연락처가 있습니다. 각 행에서「건너뛰기」또는「그래도 등록」을 선택한 뒤 진행하세요.
              </div>
              <div className="max-h-[50vh] overflow-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
                <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                  <thead className="sticky top-0 bg-zinc-100 dark:bg-zinc-800">
                    <tr>
                      <th className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-600">고객명</th>
                      <th className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-600">연락처</th>
                      <th className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-600">처리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows
                      .filter((r) => {
                        const p = formatKoreanMobile(r.phone).trim();
                        return rowIsActive(r) && duplicatePhones.has(p);
                      })
                      .map((r) => (
                        <tr key={r.key}>
                          <td className="border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">{r.name}</td>
                          <td className="border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
                            {formatKoreanMobile(r.phone)}
                          </td>
                          <td className="border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
                            <div className="flex flex-wrap gap-2">
                              <label className="inline-flex items-center gap-1 text-xs">
                                <input
                                  type="radio"
                                  checked={r.duplicateChoice === "skip"}
                                  onChange={() =>
                                    setRows((prev) =>
                                      prev.map((x) =>
                                        x.key === r.key ? { ...x, duplicateChoice: "skip" } : x
                                      )
                                    )
                                  }
                                />
                                건너뛰기
                              </label>
                              <label className="inline-flex items-center gap-1 text-xs">
                                <input
                                  type="radio"
                                  checked={r.duplicateChoice === "force"}
                                  onChange={() =>
                                    setRows((prev) =>
                                      prev.map((x) =>
                                        x.key === r.key ? { ...x, duplicateChoice: "force" } : x
                                      )
                                    )
                                  }
                                />
                                그래도 등록
                              </label>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <TapButton
                  type="button"
                  className="crm-btn-secondary"
                  disabled={submitting}
                  onClick={() => {
                    setStep("edit");
                    setDuplicatePhones(new Set());
                  }}
                >
                  ← 돌아가기
                </TapButton>
                <TapButton
                  type="button"
                  className="crm-btn-primary"
                  disabled={submitting}
                  onClick={() => void handleConfirmDuplicates()}
                >
                  저장 및 배포
                </TapButton>
              </div>
            </div>
          ) : (
            <>
              {loadingUsers ? (
                <p className="mt-4 text-sm text-zinc-500">직원 목록을 불러오는 중…</p>
              ) : null}
              <div className="mt-4 max-h-[min(60vh,520px)] overflow-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
                <table className="w-full min-w-[980px] border-collapse text-left text-xs sm:text-sm">
                  <thead className="sticky top-0 z-[1] bg-zinc-100 dark:bg-zinc-800">
                    <tr>
                      <th className="border-b border-zinc-200 px-2 py-2 dark:border-zinc-600">번호</th>
                      <th className="border-b border-zinc-200 px-2 py-2 dark:border-zinc-600">고객명</th>
                      <th className="border-b border-zinc-200 px-2 py-2 dark:border-zinc-600">연락처</th>
                      <th className="border-b border-zinc-200 px-2 py-2 dark:border-zinc-600">원하는 차종</th>
                      <th className="border-b border-zinc-200 px-2 py-2 dark:border-zinc-600">유입경로</th>
                      <th className="border-b border-zinc-200 px-2 py-2 dark:border-zinc-600">담당 직원</th>
                      <th className="border-b border-zinc-200 px-2 py-2 dark:border-zinc-600">상담 시간대</th>
                      <th className="border-b border-zinc-200 px-2 py-2 dark:border-zinc-600">삭제</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, idx) => {
                      const err = errorRows.has(r.key);
                      return (
                        <tr
                          key={r.key}
                          className={err ? "bg-rose-50/90 dark:bg-rose-950/25" : undefined}
                        >
                          <td className="border-b border-zinc-100 px-2 py-1.5 align-middle dark:border-zinc-800">
                            {idx + 1}
                          </td>
                          <td className="border-b border-zinc-100 px-2 py-1.5 align-middle dark:border-zinc-800">
                            <input
                              className="crm-field w-[120px] min-w-0 sm:w-36"
                              value={r.name}
                              onChange={(e) =>
                                setRows((prev) =>
                                  prev.map((x) => (x.key === r.key ? { ...x, name: e.target.value } : x))
                                )
                              }
                            />
                          </td>
                          <td className="border-b border-zinc-100 px-2 py-1.5 align-middle dark:border-zinc-800">
                            <input
                              className="crm-field w-[128px] min-w-0 sm:w-40"
                              value={r.phone}
                              onChange={(e) =>
                                setRows((prev) =>
                                  prev.map((x) =>
                                    x.key === r.key ? { ...x, phone: formatKoreanMobile(e.target.value) } : x
                                  )
                                )
                              }
                              placeholder="010-0000-0000"
                            />
                          </td>
                          <td className="border-b border-zinc-100 px-2 py-1.5 align-middle dark:border-zinc-800">
                            <input
                              className="crm-field w-[100px] min-w-0 sm:w-32"
                              value={r.desiredCar}
                              onChange={(e) =>
                                setRows((prev) =>
                                  prev.map((x) =>
                                    x.key === r.key ? { ...x, desiredCar: e.target.value } : x
                                  )
                                )
                              }
                            />
                          </td>
                          <td className="border-b border-zinc-100 px-2 py-1.5 align-middle dark:border-zinc-800">
                            <div className="flex flex-col gap-1">
                              <select
                                className="crm-field crm-field-select min-w-[100px]"
                                value={r.source}
                                onChange={(e) =>
                                  setRows((prev) =>
                                    prev.map((x) =>
                                      x.key === r.key
                                        ? { ...x, source: e.target.value, sourceOther: "" }
                                        : x
                                    )
                                  )
                                }
                              >
                                <option value="">선택</option>
                                {LEAD_SOURCE_OPTIONS.map((s) => (
                                  <option key={s} value={s}>
                                    {s}
                                  </option>
                                ))}
                              </select>
                              {r.source === "기타" ? (
                                <input
                                  className="crm-field min-w-[100px]"
                                  placeholder="기타 상세"
                                  value={r.sourceOther}
                                  onChange={(e) =>
                                    setRows((prev) =>
                                      prev.map((x) =>
                                        x.key === r.key ? { ...x, sourceOther: e.target.value } : x
                                      )
                                    )
                                  }
                                />
                              ) : null}
                            </div>
                          </td>
                          <td className="border-b border-zinc-100 px-2 py-1.5 align-middle dark:border-zinc-800">
                            <select
                              className="crm-field crm-field-select min-w-[120px]"
                              value={r.managerUserId}
                              onChange={(e) =>
                                setRows((prev) =>
                                  prev.map((x) =>
                                    x.key === r.key ? { ...x, managerUserId: e.target.value } : x
                                  )
                                )
                              }
                            >
                              <option value="">선택</option>
                              {assignableUsers.map((u) => (
                                <option key={u.id} value={u.id ?? ""}>
                                  {(u.name ?? "").trim()}
                                  {(u.rank ?? "").trim() ? ` (${(u.rank ?? "").trim()})` : ""}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="border-b border-zinc-100 px-2 py-1.5 align-middle dark:border-zinc-800">
                            <select
                              className="crm-field crm-field-select min-w-[120px]"
                              value={r.consultationTimeSlot}
                              onChange={(e) =>
                                setRows((prev) =>
                                  prev.map((x) =>
                                    x.key === r.key ? { ...x, consultationTimeSlot: e.target.value } : x
                                  )
                                )
                              }
                            >
                              {SLOT_OPTIONS.map((o) => (
                                <option key={o.value || "none"} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="border-b border-zinc-100 px-2 py-1.5 align-middle dark:border-zinc-800">
                            <TapButton
                              type="button"
                              className="crm-btn-secondary px-2 py-1 text-xs"
                              disabled={rows.length <= 1}
                              onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
                            >
                              삭제
                            </TapButton>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <TapButton
                  type="button"
                  className="crm-btn-secondary"
                  disabled={submitting}
                  onClick={() => setRows((prev) => [...prev, emptyRow()])}
                >
                  + 행 추가
                </TapButton>
                <TapButton
                  type="button"
                  className="crm-btn-secondary"
                  disabled={submitting}
                  onClick={() => resetForm()}
                >
                  ⟳ 초기화
                </TapButton>
                <span className="flex-1" />
                <TapButton type="button" className="crm-btn-secondary" disabled={submitting} onClick={onClose}>
                  취소
                </TapButton>
                <TapButton
                  type="button"
                  className="crm-btn-primary"
                  disabled={submitting || loadingUsers}
                  onClick={() => void handleSaveClick()}
                >
                  저장 및 배포
                </TapButton>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
