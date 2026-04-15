"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Lead } from "../../_lib/leaseCrmTypes";
import {
  COUNSEL_ASSIST_OBJECTION_OPTIONS,
  COUNSEL_ASSIST_PURPOSES,
  COUNSEL_ASSIST_UI_TONES,
  defaultCounselAssistManualInput,
  defaultCounselAssistRequestOptions,
  type CounselAssistManualInput,
  type CounselAssistPurpose,
  type CounselAssistUiTone,
} from "../../_lib/counselAssistShared";
import { getDataAccessScopeByRank } from "../../_lib/rolePermissions";
import { useAuth } from "@/app/_components/auth/AuthProvider";
import toast from "react-hot-toast";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type RequestOptions = {
  uiTone: CounselAssistUiTone;
  purpose: CounselAssistPurpose;
};

type GenerateMentResult = {
  mainMent: string;
  altMent1: string;
  altMent2: string;
  analysis: {
    customerTemperature: "HOT" | "WARM" | "COLD";
    urgencyLevel: "긴급" | "보통" | "여유";
    keyPoint: string;
    cautionNote: string;
    nextAction: string;
  };
  timing: string;
};

const COPY_OK = "복사되었습니다.";
const COPY_FAIL = "복사에 실패했습니다.";

function leadDraftKey(leadId: string) {
  return `nowcar_ai_assist_draft:${leadId}`;
}

function InfoTag({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-zinc-300 bg-zinc-100 px-2 py-1 text-[11px] font-medium text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200">
      {label}
    </span>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-200/90 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900/60">
      <h4 className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">{title}</h4>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function ToneSelector({ value, onChange }: { value: CounselAssistUiTone; onChange: (v: CounselAssistUiTone) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {COUNSEL_ASSIST_UI_TONES.map((tone) => (
        <button
          key={tone}
          type="button"
          onClick={() => onChange(tone)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium",
            value === tone
              ? "border-sky-600 bg-sky-600 text-white"
              : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
          )}
        >
          {tone}
        </button>
      ))}
    </div>
  );
}

export default function AiCounselAssistPopup({ lead }: { lead?: Lead | null }) {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [result, setResult] = useState<GenerateMentResult | null>(null);
  const [copyFlash, setCopyFlash] = useState<"mainMent" | "altMent1" | "altMent2" | null>(null);
  const [expandedAlt, setExpandedAlt] = useState<"altMent1" | "altMent2" | null>(null);

  const [options, setOptions] = useState<RequestOptions>(defaultCounselAssistRequestOptions());
  const [manualInput, setManualInput] = useState<CounselAssistManualInput>(defaultCounselAssistManualInput(lead));

  const hasLead = !!lead?.id;
  const accessScope = getDataAccessScopeByRank({
    role: profile?.role,
    rank: profile?.rank,
    team_name: profile?.teamName,
  });
  const deniedByUi =
    !!hasLead &&
    accessScope === "self" &&
    (!lead?.managerUserId || (profile?.userId ? lead.managerUserId !== profile.userId : true));

  const denyReason = deniedByUi
    ? !lead?.managerUserId
      ? "현재 권한 범위에서는 미배정 리드를 AI 분석할 수 없습니다."
      : "현재 권한 범위에서는 본인 담당 리드에서만 AI 상담 어시스트를 사용할 수 있습니다."
    : "";

  useEffect(() => {
    if (!lead?.id) {
      setManualInput(defaultCounselAssistManualInput());
      setOptions(defaultCounselAssistRequestOptions());
      setResult(null);
      setErrorText("");
      return;
    }

    const fallbackManual = defaultCounselAssistManualInput(lead);
    const fallbackOptions = defaultCounselAssistRequestOptions();
    try {
      const raw = window.localStorage.getItem(leadDraftKey(lead.id));
      if (!raw) {
        setManualInput(fallbackManual);
        setOptions(fallbackOptions);
        setResult(null);
        setErrorText("");
        return;
      }
      const parsed = JSON.parse(raw) as { manualInput?: CounselAssistManualInput; options?: RequestOptions };
      setManualInput(parsed.manualInput ?? fallbackManual);
      setOptions(parsed.options ?? fallbackOptions);
      setResult(null);
      setErrorText("");
    } catch {
      setManualInput(fallbackManual);
      setOptions(fallbackOptions);
      setResult(null);
      setErrorText("");
    }
  }, [lead?.id]);

  useEffect(() => {
    if (!lead?.id) return;
    try {
      window.localStorage.setItem(leadDraftKey(lead.id), JSON.stringify({ manualInput, options }));
    } catch {
      // ignore
    }
  }, [lead?.id, manualInput, options]);

  const customerInfo = useMemo(() => {
    if (!lead) return {};
    return {
      leadId: lead.id,
      name: lead.base.name,
      phone: lead.base.phone,
      desiredVehicle: manualInput.desiredVehicle || lead.base.desiredVehicle,
      source: lead.base.source,
      budget: manualInput.upfrontBudgetRange || lead.base.depositOrPrepaymentAmount,
      monthlyPayment: lead.base.wantedMonthlyPayment,
      status: lead.counselingStatus,
      leadPriority: lead.leadPriority,
      leadTemperature: lead.base.leadTemperature,
      reactionSummary: manualInput.reactionSummary,
      lastCustomerReaction: manualInput.lastCustomerReaction,
      urgency: manualInput.urgency,
      recentChannel: manualInput.recentChannel,
      objections: manualInput.objections,
      objectionsFreeText: manualInput.objectionsFreeText,
    };
  }, [lead, manualInput]);

  const consultationHistory = useMemo(() => {
    if (!lead?.counselingRecords?.length) return [];
    return lead.counselingRecords.slice(0, 12).map((record) => ({
      occurredAt: record.occurredAt,
      method: record.method,
      counselor: record.counselor,
      content: record.content,
      reaction: record.reaction,
      nextContactAt: record.nextContactAt,
    }));
  }, [lead]);

  const autoInfoTags = useMemo(() => {
    if (!lead) return [];
    const tags = [
      lead.base.desiredVehicle ? `[${lead.base.desiredVehicle}]` : "",
      lead.base.customerType ? `[${lead.base.customerType}]` : "",
      lead.base.depositOrPrepaymentAmount ? `[${lead.base.depositOrPrepaymentAmount}]` : "",
      lead.base.source ? `[${lead.base.source}]` : "",
      lead.counselingStatus ? `[${lead.counselingStatus}]` : "",
      lead.nextContactAt ? `[마지막연락:${lead.nextContactAt.slice(0, 10)}]` : "",
    ].filter(Boolean);
    return tags.slice(0, 8);
  }, [lead]);

  const handleToggleObjection = (value: (typeof COUNSEL_ASSIST_OBJECTION_OPTIONS)[number]) => {
    setManualInput((prev) => {
      const has = prev.objections.includes(value);
      return {
        ...prev,
        objections: has ? prev.objections.filter((v) => v !== value) : [...prev.objections, value],
      };
    });
  };

  const runAnalysis = useCallback(
    async (nextOptions?: Partial<RequestOptions>) => {
      if (!lead?.id) return;
      if (deniedByUi) {
        toast.error(denyReason || "접근 권한이 없습니다.");
        return;
      }

      const requestOptions = { ...options, ...(nextOptions ?? {}) };
      if (nextOptions) setOptions(requestOptions);

      setLoading(true);
      setErrorText("");
      try {
        const response = await fetch("/api/ai/generate-ment", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            tone: requestOptions.uiTone,
            purpose: requestOptions.purpose,
            customerInfo,
            consultationHistory,
          }),
        });

        const data = (await response.json()) as { ok?: boolean; result?: GenerateMentResult; error?: string };

        if (!response.ok) {
          throw new Error(data.error ?? "AI 분석 요청에 실패했습니다.");
        }
        if (!data.result) {
          throw new Error(data.error ?? "분석 결과를 받지 못했습니다.");
        }

        setResult(data.result);
        setExpandedAlt(null);
        if (data.ok === false && data.error) toast(data.error, { icon: "⚠️" });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "AI 요청 실패";
        setErrorText(msg);
        setResult(null);
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    },
    [lead, deniedByUi, denyReason, options, customerInfo, consultationHistory]
  );

  const copyText = async (text: string, key: "mainMent" | "altMent1" | "altMent2") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyFlash(key);
      window.setTimeout(() => setCopyFlash(null), 2000);
      toast.success(COPY_OK);
    } catch {
      toast.error(COPY_FAIL);
    }
  };

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.97 }}
        className="fixed bottom-5 right-5 z-[60] flex h-12 w-12 items-center justify-center rounded-full border border-indigo-200/80 bg-gradient-to-br from-sky-600 to-indigo-700 text-lg text-white shadow-lg shadow-indigo-900/30 transition-shadow hover:shadow-xl md:bottom-6 md:right-6"
        aria-label="AI 상담 어시스트 열기"
      >
        <span aria-hidden>✨</span>
      </motion.button>

      <AnimatePresence>
        {open ? (
          <>
            <motion.div
              className="fixed inset-0 z-[61] bg-black/25 backdrop-blur-[1px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.section
              className="fixed bottom-0 z-[62] flex w-full flex-col border-zinc-200 bg-zinc-50 shadow-2xl dark:border-zinc-700 dark:bg-zinc-950 md:bottom-6 md:right-6 md:max-h-[min(88dvh,760px)] md:w-[460px] md:max-w-[calc(100vw-2rem)] md:rounded-2xl md:border"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 14 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              style={{ maxHeight: "min(92dvh, 760px)" }}
            >
              <div className="shrink-0 border-b border-zinc-200/90 px-4 py-3 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">AI 상담 어시스트</h3>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      실전 멘트 생성 · 장기렌트/리스 영업 대응
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-lg px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-200/80 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    aria-label="닫기"
                  >
                    ✕
                  </button>
                </div>

                <div className="mt-3 space-y-2">
                  <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">상담원 톤</div>
                  <ToneSelector value={options.uiTone} onChange={(v) => setOptions((p) => ({ ...p, uiTone: v }))} />
                  <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">목적</div>
                  <select
                    value={options.purpose}
                    onChange={(e) => setOptions((p) => ({ ...p, purpose: e.target.value as CounselAssistPurpose }))}
                    className="crm-field crm-field-select w-full"
                  >
                    {COUNSEL_ASSIST_PURPOSES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid min-h-0 flex-1 grid-rows-[auto_1fr] gap-3 overflow-hidden px-4 py-3">
                <div className="space-y-2 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900/70">
                  <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">입력 보정</div>
                  {!hasLead ? (
                    <div className="text-xs text-zinc-500">고객 상세를 열면 AI 분석 입력을 작성할 수 있습니다.</div>
                  ) : (
                    <>
                      <textarea
                        value={manualInput.reactionSummary}
                        onChange={(e) => setManualInput((p) => ({ ...p, reactionSummary: e.target.value }))}
                        placeholder="고객 현재 반응 요약"
                        className="h-16 w-full resize-none rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                      />
                      <div className="flex flex-wrap gap-1.5">
                        {COUNSEL_ASSIST_OBJECTION_OPTIONS.map((o) => {
                          const active = manualInput.objections.includes(o);
                          return (
                            <button
                              key={o}
                              type="button"
                              onClick={() => handleToggleObjection(o)}
                              className={cn(
                                "rounded-full border px-2 py-1 text-[11px]",
                                active
                                  ? "border-amber-500 bg-amber-500/15 text-amber-900 dark:text-amber-100"
                                  : "border-zinc-300 text-zinc-700 dark:border-zinc-600 dark:text-zinc-300"
                              )}
                            >
                              {o}
                            </button>
                          );
                        })}
                      </div>
                      {autoInfoTags.length > 0 ? (
                        <div className="space-y-2">
                          <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">자동 연동 고객 정보</div>
                          <div className="flex flex-wrap gap-1.5">
                            {autoInfoTags.map((tag) => (
                              <InfoTag key={tag} label={tag} />
                            ))}
                          </div>
                        </div>
                      ) : null}
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          value={manualInput.desiredVehicle}
                          onChange={(e) => setManualInput((p) => ({ ...p, desiredVehicle: e.target.value }))}
                          placeholder="희망 차종"
                          className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                        />
                        <input
                          value={manualInput.alternativeVehicle}
                          onChange={(e) => setManualInput((p) => ({ ...p, alternativeVehicle: e.target.value }))}
                          placeholder="대체 가능 차종"
                          className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                        />
                        <input
                          value={manualInput.upfrontBudgetRange}
                          onChange={(e) => setManualInput((p) => ({ ...p, upfrontBudgetRange: e.target.value }))}
                          placeholder="초기비용 가능 범위"
                          className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                        />
                        <input
                          value={manualInput.lastCustomerReaction}
                          onChange={(e) => setManualInput((p) => ({ ...p, lastCustomerReaction: e.target.value }))}
                          placeholder="마지막 고객 반응 한 줄"
                          className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <select
                          value={manualInput.urgency}
                          onChange={(e) => setManualInput((p) => ({ ...p, urgency: e.target.value as "급함" | "보통" | "낮음" }))}
                          className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                        >
                          <option value="급함">급함</option>
                          <option value="보통">보통</option>
                          <option value="낮음">낮음</option>
                        </select>
                        <select
                          value={manualInput.recentChannel}
                          onChange={(e) =>
                            setManualInput((p) => ({ ...p, recentChannel: e.target.value as CounselAssistManualInput["recentChannel"] }))
                          }
                          className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                        >
                          <option value="전화">전화</option>
                          <option value="문자">문자</option>
                          <option value="카톡">카톡</option>
                          <option value="방문">방문</option>
                        </select>
                        <label className="flex items-center gap-1 rounded-lg border border-zinc-300 px-2 py-1.5 text-xs dark:border-zinc-700">
                          <input
                            type="checkbox"
                            checked={manualInput.budgetSensitive}
                            onChange={(e) => setManualInput((p) => ({ ...p, budgetSensitive: e.target.checked }))}
                          />
                          예산 민감
                        </label>
                      </div>
                      <textarea
                        value={manualInput.objectionsFreeText}
                        onChange={(e) => setManualInput((p) => ({ ...p, objectionsFreeText: e.target.value }))}
                        placeholder="추가 특이사항을 입력하세요 (예: 색상 고집, 급한 출고 등)"
                        className="h-14 w-full resize-none rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                      />
                    </>
                  )}
                </div>

                <div className="min-h-0 overflow-y-auto space-y-3 pr-1">
                  {deniedByUi ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                      {denyReason}
                    </div>
                  ) : null}

                  {errorText ? (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100">
                      {errorText}
                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={() => void runAnalysis()}
                          className="rounded-md bg-rose-600 px-2 py-1 text-[11px] font-semibold text-white"
                        >
                          재시도
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {loading ? (
                    <div className="space-y-2">
                      <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-100">
                        AI가 최적의 멘트를 분석 중입니다...
                      </div>
                      <div className="h-20 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
                      <div className="h-28 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
                      <div className="h-24 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
                    </div>
                  ) : null}

                  {!loading && !result ? (
                    <div className="rounded-xl border border-dashed border-zinc-300 bg-white/70 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-600 dark:bg-zinc-900/40 dark:text-zinc-400">
                      AI 분석 결과가 없습니다. 분석하기를 눌러 실전 멘트를 생성하세요.
                    </div>
                  ) : null}

                  {result ? (
                    <>
                      <SectionCard title="메인 추천 멘트">
                        <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
                          <p className="whitespace-pre-wrap text-base font-semibold leading-relaxed text-zinc-900 dark:text-zinc-100">
                            {result.mainMent}
                          </p>
                          <div className="mt-3 flex justify-end">
                            <button
                              type="button"
                              onClick={() => void copyText(result.mainMent, "mainMent")}
                              className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white"
                            >
                              {copyFlash === "mainMent" ? "복사됨 ✓" : "복사"}
                            </button>
                          </div>
                        </div>
                      </SectionCard>

                      <SectionCard title="대안 멘트">
                        <div className="space-y-2">
                          <div className="rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/60">
                            <button
                              type="button"
                              onClick={() => setExpandedAlt((prev) => (prev === "altMent1" ? null : "altMent1"))}
                              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold"
                            >
                              <span>대안 멘트 1</span>
                              <span className="text-xs text-zinc-500">{expandedAlt === "altMent1" ? "접기" : "펼치기"}</span>
                            </button>
                            {expandedAlt === "altMent1" ? (
                              <div className="border-t border-zinc-200 px-3 py-3 dark:border-zinc-700">
                                <p className="whitespace-pre-wrap text-sm leading-relaxed">{result.altMent1}</p>
                                <div className="mt-3 flex justify-end">
                                  <button
                                    type="button"
                                    onClick={() => void copyText(result.altMent1, "altMent1")}
                                    className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-semibold dark:border-zinc-600"
                                  >
                                    {copyFlash === "altMent1" ? "복사됨 ✓" : "복사"}
                                  </button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                          <div className="rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/60">
                            <button
                              type="button"
                              onClick={() => setExpandedAlt((prev) => (prev === "altMent2" ? null : "altMent2"))}
                              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold"
                            >
                              <span>대안 멘트 2</span>
                              <span className="text-xs text-zinc-500">{expandedAlt === "altMent2" ? "접기" : "펼치기"}</span>
                            </button>
                            {expandedAlt === "altMent2" ? (
                              <div className="border-t border-zinc-200 px-3 py-3 dark:border-zinc-700">
                                <p className="whitespace-pre-wrap text-sm leading-relaxed">{result.altMent2}</p>
                                <div className="mt-3 flex justify-end">
                                  <button
                                    type="button"
                                    onClick={() => void copyText(result.altMent2, "altMent2")}
                                    className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-semibold dark:border-zinc-600"
                                  >
                                    {copyFlash === "altMent2" ? "복사됨 ✓" : "복사"}
                                  </button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </SectionCard>

                      <SectionCard title="분석 요약">
                        <div className="space-y-3 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold text-zinc-500">고객 온도</span>
                            <span className="rounded-full border border-zinc-300 bg-white px-2 py-0.5 text-xs font-semibold dark:border-zinc-600 dark:bg-zinc-900">
                              {result.analysis.customerTemperature === "HOT"
                                ? "HOT 🔥"
                                : result.analysis.customerTemperature === "WARM"
                                  ? "WARM 🟡"
                                  : "COLD 🔵"}
                            </span>
                          </div>
                          <div>
                            <span className="text-xs font-semibold text-zinc-500">긴급도</span>
                            <p className="mt-1 font-medium">{result.analysis.urgencyLevel}</p>
                          </div>
                          <div>
                            <span className="text-xs font-semibold text-zinc-500">핵심 포인트</span>
                            <p className="mt-1">{result.analysis.keyPoint}</p>
                          </div>
                          <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 dark:border-indigo-500/30 dark:bg-indigo-500/10">
                            <div className="text-xs font-semibold text-indigo-700 dark:text-indigo-200">다음 액션</div>
                            <p className="mt-1 text-sm text-indigo-900 dark:text-indigo-100">{result.analysis.nextAction}</p>
                          </div>
                          <div>
                            <span className="text-xs font-semibold text-zinc-500">주의할 점</span>
                            <p className="mt-1">{result.analysis.cautionNote}</p>
                          </div>
                          <div>
                            <span className="text-xs font-semibold text-zinc-500">멘트 타이밍</span>
                            <p className="mt-1">{result.timing}</p>
                          </div>
                        </div>
                      </SectionCard>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="shrink-0 border-t border-zinc-200 bg-white/90 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/90">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!hasLead || deniedByUi || loading}
                    onClick={() => void runAnalysis()}
                    className="flex-1 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    AI 분석하기
                  </button>
                  <button
                    type="button"
                    disabled={!hasLead || deniedByUi || loading || !result}
                    onClick={() => void runAnalysis({ uiTone: options.uiTone })}
                    className="rounded-xl border border-zinc-300 px-3 py-2.5 text-xs font-semibold disabled:opacity-50 dark:border-zinc-600"
                  >
                    톤만 바꿔 다시 생성
                  </button>
                  <button
                    type="button"
                    disabled={!hasLead || deniedByUi || loading || !result}
                    onClick={() => void runAnalysis({ purpose: options.purpose })}
                    className="rounded-xl border border-zinc-300 px-3 py-2.5 text-xs font-semibold disabled:opacity-50 dark:border-zinc-600"
                  >
                    목적만 바꿔 다시 생성
                  </button>
                </div>
              </div>
            </motion.section>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}
