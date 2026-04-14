"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "../../_lib/supabaseClient";
import type { Lead } from "../../_lib/leaseCrmTypes";

type AssistResult = {
  summary: string;
  advice: string;
  suggested_message: string;
  tone_variants: {
    short: string;
    soft: string;
    strong: string;
  };
};

const QUICK_ACTIONS = [
  { label: "메시지 만들어줘", prompt: "이 고객에게 지금 보낼 짧은 메시지를 만들어줘" },
  { label: "다음 행동 추천", prompt: "이 고객에게 다음으로 어떤 행동을 하는 게 좋을지 짧게 알려줘" },
  { label: "고객 상태 분석", prompt: "이 고객의 현재 상태를 한 줄로 분석해줘" },
  { label: "지금 뭐 해야돼?", prompt: "지금 이 고객에게 가장 적절한 다음 행동 하나만 추천해줘" },
] as const;

const TONE_ACTIONS = [
  { label: "짧게", tone: "short" as const },
  { label: "부드럽게", tone: "soft" as const },
  { label: "적극적으로", tone: "strong" as const },
] as const;

export default function AiCounselAssistPopup({ lead }: { lead?: Lead }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [result, setResult] = useState<AssistResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [copyDone, setCopyDone] = useState(false);
  const [speedMs, setSpeedMs] = useState<number | null>(null);
  const [activeTone, setActiveTone] = useState<"default" | "short" | "soft" | "strong">("default");
  const [errorText, setErrorText] = useState("");

  const displayMessage = useMemo(() => {
    if (!result) return "";
    if (activeTone === "default") return result.suggested_message;
    return result.tone_variants[activeTone];
  }, [result, activeTone]);

  async function callAssist(question: string) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error("세션이 만료되었습니다. 다시 로그인해 주세요.");

    const start = performance.now();
    const response = await fetch("/api/ai-assist", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        leadId: lead?.id,
        question,
      }),
    });
    const elapsed = Math.round(performance.now() - start);
    setSpeedMs(elapsed);

    const data = (await response.json()) as {
      result?: AssistResult;
      error?: string;
    };
    if (!response.ok || !data.result) {
      throw new Error(data.error ?? "AI 응답을 생성하지 못했습니다.");
    }
    return data.result;
  }

  async function ask(question: string) {
    if (!question.trim() || loading) return;
    setLoading(true);
    setCopyDone(false);
    setErrorText("");
    try {
      const next = await callAssist(question.trim());
      setResult(next);
      setActiveTone("default");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "AI 요청 실패";
      setErrorText(msg || "AI 답변 생성에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function copyMessage() {
    if (!displayMessage) return;
    try {
      await navigator.clipboard.writeText(displayMessage);
      setCopyDone(true);
      window.setTimeout(() => setCopyDone(false), 1300);
    } catch {
      setCopyDone(false);
    }
  }

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.97 }}
        className="fixed bottom-5 right-5 z-[45] flex h-12 w-12 items-center justify-center rounded-full border border-sky-200 bg-sky-600 text-lg text-white shadow-lg shadow-sky-900/25 transition-shadow hover:shadow-xl hover:shadow-sky-900/30 md:bottom-6 md:right-6"
        aria-label="AI 상담 어시스트 열기"
      >
        🤖
      </motion.button>

      <AnimatePresence>
        {open ? (
          <>
            <motion.div
              className="fixed inset-0 z-[46] bg-black/20 md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.section
              className="fixed bottom-0 z-[47] w-full border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900 md:bottom-20 md:right-6 md:w-[360px] md:max-w-[calc(100vw-2rem)] md:rounded-2xl md:border"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              style={{ maxHeight: "min(82dvh, 500px)" }}
            >
              <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">AI 상담 어시스트</h3>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md px-2 py-1 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  aria-label="닫기"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3 border-b border-zinc-200 px-3 py-3 dark:border-zinc-800">
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_ACTIONS.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      disabled={loading}
                      onClick={() => {
                        setInput(item.prompt);
                        void ask(item.prompt);
                      }}
                      className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                {speedMs != null ? (
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">최근 응답 시간: 약 {speedMs}ms</p>
                ) : null}
              </div>

              <div className="max-h-[250px] space-y-2 overflow-y-auto px-3 py-3">
                {!result && !errorText ? (
                  <div className="rounded-lg border border-dashed border-zinc-300 px-3 py-3 text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                    빠른 버튼을 누르거나 질문을 입력하면, 고객 컨텍스트를 자동 반영해 답변합니다.
                  </div>
                ) : null}
                {errorText ? (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
                    AI 답변 생성에 실패했습니다. {errorText}
                  </div>
                ) : null}
                {result ? (
                  <div className="space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-700 dark:bg-zinc-800/60">
                    <div>
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">요약</div>
                      <p className="text-zinc-800 dark:text-zinc-100">{result.summary}</p>
                    </div>
                    <div>
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">추천 행동</div>
                      <p className="text-zinc-800 dark:text-zinc-100">{result.advice}</p>
                    </div>
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-zinc-800 dark:border-emerald-700/50 dark:bg-emerald-900/20 dark:text-zinc-100">
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                        추천 메시지
                      </div>
                      <p>{displayMessage}</p>
                    </div>
                  </div>
                ) : null}
                {loading ? (
                  <div className="mr-3 inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    생각중
                    <span className="inline-flex gap-1">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.2s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.1s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400" />
                    </span>
                  </div>
                ) : null}
              </div>

              <div className="space-y-2 border-t border-zinc-200 px-3 py-3 dark:border-zinc-800">
                {result ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void copyMessage()}
                      className="rounded-md border border-zinc-300 px-2 py-1 text-[11px] font-medium hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
                    >
                      {copyDone ? "복사됨" : "복사"}
                    </button>
                    {TONE_ACTIONS.map((t) => (
                      <button
                        key={t.label}
                        type="button"
                        disabled={loading || !result}
                        onClick={() => setActiveTone(t.tone)}
                        className={`rounded-md border px-2 py-1 text-[11px] font-medium disabled:opacity-60 ${
                          activeTone === t.tone
                            ? "border-sky-600 bg-sky-600 text-white"
                            : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                ) : null}

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void ask(input);
                  }}
                  className="flex items-end gap-2"
                >
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="예: 지금 전화해도 될까?"
                    rows={2}
                    className="min-h-[62px] flex-1 resize-none rounded-lg border border-zinc-300 px-2.5 py-2 text-sm outline-none ring-sky-200 transition focus:border-sky-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                  <button
                    type="submit"
                    disabled={loading || !input.trim()}
                    className="h-10 rounded-lg bg-sky-600 px-3 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    전송
                  </button>
                </form>
              </div>
            </motion.section>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}
