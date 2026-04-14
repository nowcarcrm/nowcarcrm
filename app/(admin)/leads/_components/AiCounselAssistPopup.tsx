"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "../../_lib/supabaseClient";
import type { Lead } from "../../_lib/leaseCrmTypes";
import {
  COUNSEL_ASSIST_OBJECTION_OPTIONS,
  COUNSEL_ASSIST_PURPOSES,
  COUNSEL_ASSIST_UI_TONES,
  buildCounselAssistPayload,
  defaultCounselAssistManualInput,
  defaultCounselAssistRequestOptions,
  type CounselAssistManualInput,
  type CounselAssistMessageTone,
  type CounselAssistPurpose,
  type CounselAssistResult,
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

const COPY_OK = "복사되었습니다.";
const COPY_FAIL = "복사에 실패했습니다.";

function leadDraftKey(leadId: string) {
  return `nowcar_ai_assist_draft:${leadId}`;
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const v = Math.min(100, Math.max(0, value));
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
        <span>{label}</span>
        <span className="tabular-nums text-zinc-900 dark:text-zinc-100">{v}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-indigo-600" style={{ width: `${v}%` }} />
      </div>
    </div>
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
  const [result, setResult] = useState<CounselAssistResult | null>(null);
  const [copyFlash, setCopyFlash] = useState<CounselAssistMessageTone | "oneLine" | "all" | null>(null);

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

  const payloadPreview = useMemo(() => {
    if (!result) return "";
    return [
      `현재 단계: ${result.customerStage}`,
      `지금 추천 액션: ${result.recommendedAction}`,
      `한 줄 답변: ${result.oneLineReply}`,
      `전환 코멘트: ${result.conversionLikelihoodNote}`,
      `Push/Pause: ${result.pushOrPauseAdvice}`,
    ].join("\n");
  }, [result]);

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
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) throw new Error("로그인이 필요합니다.");

        const response = await fetch("/api/ai/counsel-assist", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            context: buildCounselAssistPayload(lead),
            options: requestOptions,
            manualInput,
          }),
        });

        const data = (await response.json()) as { ok?: boolean; result?: CounselAssistResult; error?: string };

        if (!response.ok) {
          throw new Error(data.error ?? "AI 분석 요청에 실패했습니다.");
        }
        if (!data.result) {
          throw new Error(data.error ?? "분석 결과를 받지 못했습니다.");
        }

        setResult(data.result);
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
    [lead, deniedByUi, denyReason, options, manualInput]
  );

  const copyText = async (text: string, key: CounselAssistMessageTone | "oneLine" | "all") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyFlash(key);
      window.setTimeout(() => setCopyFlash(null), 1300);
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
                        placeholder="objection 자유 입력"
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
                      <SectionCard title="고객 상태 요약">
                        <ul className="list-inside list-disc space-y-1 text-sm text-zinc-800 dark:text-zinc-100">
                          {result.summary.map((line, i) => (
                            <li key={i}>{line}</li>
                          ))}
                        </ul>
                        <div className="mt-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{result.customerStage}</div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {result.riskSignals.map((r) => (
                            <span
                              key={r}
                              className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] dark:border-amber-500/30 dark:bg-amber-500/10"
                            >
                              {r}
                            </span>
                          ))}
                        </div>
                        <div className="mt-3 space-y-2">
                          <ScoreBar label="구매 의도" value={result.purchaseIntentScore} />
                          <ScoreBar label="가격 민감도" value={result.priceSensitivityScore} />
                          <ScoreBar label="이탈 위험" value={result.responseRiskScore} />
                        </div>
                      </SectionCard>

                      <SectionCard title="추천 액션 / 포인트">
                        <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-200">{result.recommendedAction}</p>
                        <ul className="mt-2 list-inside list-decimal space-y-1 text-sm">
                          {result.recommendedActions.map((a, i) => (
                            <li key={i}>{a}</li>
                          ))}
                        </ul>
                        <div className="mt-3">
                          <div className="text-xs font-semibold">상담 포인트</div>
                          <ul className="mt-1 list-inside list-disc text-sm">
                            {result.talkPoints.map((p, i) => (
                              <li key={i}>{p}</li>
                            ))}
                          </ul>
                        </div>
                        <div className="mt-3 space-y-1 text-xs text-zinc-600 dark:text-zinc-300">
                          <div>전환 코멘트: {result.conversionLikelihoodNote}</div>
                          <div>Push/Pause: {result.pushOrPauseAdvice}</div>
                        </div>
                      </SectionCard>

                      <SectionCard title="추천 답변 3개">
                        <div className="space-y-2">
                          {result.messageSuggestions.map((m) => (
                            <div key={m.tone} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900">
                              <div className="flex items-center justify-between">
                                <div className="text-xs font-bold text-sky-700 dark:text-sky-300">{m.tone}</div>
                                <button
                                  type="button"
                                  onClick={() => void copyText(m.text, m.tone)}
                                  className="rounded-md bg-sky-600 px-2 py-1 text-[11px] font-semibold text-white"
                                >
                                  {copyFlash === m.tone ? "복사완료" : "복사"}
                                </button>
                              </div>
                              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{m.text}</p>
                            </div>
                          ))}
                        </div>
                      </SectionCard>

                      <SectionCard title="한 줄 카톡 / 다음 질문 / 주의 표현">
                        <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium">{result.oneLineReply}</p>
                            <button
                              type="button"
                              onClick={() => void copyText(result.oneLineReply, "oneLine")}
                              className="rounded-md border border-zinc-300 px-2 py-1 text-[11px] dark:border-zinc-600"
                            >
                              {copyFlash === "oneLine" ? "복사완료" : "복사"}
                            </button>
                          </div>
                        </div>
                        <div className="mt-2 text-sm">
                          <div className="font-semibold">다음 질문 2개</div>
                          <ol className="list-inside list-decimal">
                            {result.nextQuestions.map((q, i) => (
                              <li key={i}>{q}</li>
                            ))}
                          </ol>
                        </div>
                        <div className="mt-2 text-sm">
                          <div className="font-semibold">주의할 표현</div>
                          <ul className="list-inside list-disc">
                            {result.cautionPhrases.map((c, i) => (
                              <li key={i}>{c}</li>
                            ))}
                          </ul>
                        </div>
                      </SectionCard>

                      <button
                        type="button"
                        onClick={() => void copyText(payloadPreview, "all")}
                        className="w-full rounded-lg border border-zinc-300 bg-white py-2 text-sm font-semibold hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900"
                      >
                        {copyFlash === "all" ? "전체 복사완료" : "핵심 전체 복사"}
                      </button>
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
