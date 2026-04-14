"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "../../_lib/supabaseClient";
import type { Lead } from "../../_lib/leaseCrmTypes";
import {
  buildCounselAssistPayload,
  type CounselAssistMessageTone,
  type CounselAssistResult,
} from "../../_lib/counselAssistShared";
import toast from "react-hot-toast";

const UI = {
  assistantTitle: "\u0041\u0049 \uc0c1\ub2f4 \uc5b4\uc2dc\uc2a4\ud2b8",
  assistantSubtitle:
    "\uc7a5\uae30\ub80c\ud2b8\xb7\ub9ac\uc2a4 \uc601\uc5c5 \uc6a9 \uba40\ud2b8 \ubc0f \ub2e4\uc74c \uc561\uc158",
  openAria: "\u0041\u0049 \uc0c1\ub2f4 \uc5b4\uc2dc\uc2a4\ud2b8 \uc5f4\uae30",
  closeAria: "\ub2eb\uae30",
  needLogin: "\ub85c\uadf8\uc778\uc774 \ud544\uc694\ud569\ub2c8\ub2e4.",
  requestFail: "\u0041\u0049 \ubd84\uc11d \uc694\uccad\uc5d0 \uc2e4\ud328\ud588\uc2b5\ub2c8\ub2e4.",
  noResult: "\uacb0\uacfc\ub97c \ubc1b\uc9c0 \ubabb\ud588\uc2b5\ub2c8\ub2e4.",
  openDetailHint:
    "\uace0\uac1d \uc0c1\uc138\ub97c \uc5f4\uba74 \ud574\ub2f9 \uace0\uac1d \uae30\uc900\uc73c\ub85c \u0041\u0049 \ubd84\uc11d\uc744 \uc2e4\ud589\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4.",
  emptyPrompt:
    "\u300c\u0041\u0049 \ubd84\uc11d\ud558\uae30\u300d\ub97c \ub20c\ub7ec \uc0c1\ub2f4 \uc694\uc57d, \uace0\uac1d \uc0c1\ud0dc, \ucd94\ucc9c \uba40\ud2b8\ub97c \uc0dd\uc131\ud569\ub2c8\ub2e4.",
  analyzing: "\uace0\uac1d \ub370\uc774\ud130\ub97c \ubd84\uc11d \uc911\uc785\ub2c8\ub2e4\u2026",
  sectionSummary: "\ucd5c\uadfc \uc0c1\ub2f4 \uc694\uc57d",
  sectionStage: "\uace0\uac1d \uc0c1\ud0dc \ubd84\uc11d",
  sectionActions: "\ucd94\ucc9c \uc561\uc158",
  sectionMessages: "\ucd94\ucc9c \uba40\ud2b8 (\uce74\ud1a1\xb7\ubb38\uc790)",
  scoreContract: "\uacc4\uc57d \uac00\ub2a5\uc131 (\ucd94\uc815)",
  scorePrice: "\uac00\uaca9 \ubbfc\uac10\ub3c4 (\ucd94\uc815)",
  scoreGhost: "\uc751\ub2f5 \uc774\ud0c8 \uc704\ud5d8 (\ucd94\uc815)",
  copyAction: "\ucd94\ucc9c \uc561\uc158 \ubb38\uc7a5 \ubcf5\uc0ac",
  copy: "\ubcf5\uc0ac",
  copied: "\ubcf5\uc0ac\uc644\ub8cc",
  analyze: "\u0041\u0049 \ubd84\uc11d\ud558\uae30",
  regenerate: "\ub2e4\uc2dc \uc0dd\uc131",
  footerNote:
    "\u0041\u0049 \ucd9c\ub825\uc740 \ucc38\uace0\uc6a9\uc774\uba70 \uc2ec\uc0ac \ud1b5\uacfc \ud560\uc778 \ub4f1\uc740 \ubcf4\uc7a5\ud558\uc9c0 \uc54a\uc2b5\ub2c8\ub2e4. \ubc1c\uc1a1 \uc804 \ub2f4\ub2f9\uc790\uac00 \ub0b4\uc6a9\uc744 \ud655\uc778\ud558\uc138\uc694.",
  copyOk: "\ubcf5\uc0ac\ub418\uc5c8\uc2b5\ub2c8\ub2e4.",
  copyFail: "\ubcf5\uc0ac\uc5d0 \uc2e4\ud328\ud588\uc2b5\ub2c8\ub2e4.",
  requestFailToast: "\u0041\u0049 \uc694\uccad \uc2e4\ud328",
};

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const v = Math.min(100, Math.max(0, value));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
        <span>{label}</span>
        <span className="tabular-nums text-zinc-900 dark:text-zinc-100">{v}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-[width] duration-500"
          style={{ width: `${v}%` }}
        />
      </div>
    </div>
  );
}

function SectionCard({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-zinc-200/90 bg-white/80 p-4 shadow-sm dark:border-zinc-700/80 dark:bg-zinc-900/50",
        className
      )}
    >
      <h4 className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">{title}</h4>
      <div className="mt-3">{children}</div>
    </div>
  );
}

export default function AiCounselAssistPopup({ lead }: { lead?: Lead | null }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<CounselAssistResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [copyFlash, setCopyFlash] = useState<CounselAssistMessageTone | "action" | null>(null);

  useEffect(() => {
    setResult(null);
    setErrorText("");
    setCopyFlash(null);
  }, [lead?.id]);

  const runAnalysis = useCallback(async () => {
    if (!lead?.id) return;
    setLoading(true);
    setErrorText("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error(UI.needLogin);

      const context = buildCounselAssistPayload(lead);
      const response = await fetch("/api/ai/counsel-assist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ context }),
      });

      const data = (await response.json()) as {
        ok?: boolean;
        result?: CounselAssistResult;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? UI.requestFail);
      }
      if (!data.result) {
        throw new Error(data.error ?? UI.noResult);
      }
      setResult(data.result);
      if (data.ok === false && data.error) {
        toast(data.error, { icon: "\u26a0\ufe0f" });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : UI.requestFailToast;
      setErrorText(msg);
      setResult(null);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [lead]);

  async function copyText(text: string, key: CounselAssistMessageTone | "action") {
    try {
      await navigator.clipboard.writeText(text);
      setCopyFlash(key);
      window.setTimeout(() => setCopyFlash(null), 1200);
      toast.success(UI.copyOk);
    } catch {
      toast.error(UI.copyFail);
    }
  }

  const hasLead = !!lead?.id;

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.97 }}
        className="fixed bottom-5 right-5 z-[60] flex h-12 w-12 items-center justify-center rounded-full border border-indigo-200/80 bg-gradient-to-br from-sky-600 to-indigo-700 text-lg text-white shadow-lg shadow-indigo-900/30 transition-shadow hover:shadow-xl md:bottom-6 md:right-6"
        aria-label={UI.openAria}
      >
        <span aria-hidden>{"\u2728"}</span>
      </motion.button>

      <AnimatePresence>
        {open ? (
          <>
            <motion.div
              className="fixed inset-0 z-[61] bg-black/25 backdrop-blur-[1px] md:bg-black/20"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.section
              className="fixed bottom-0 z-[62] flex w-full flex-col border-zinc-200 bg-zinc-50 shadow-2xl dark:border-zinc-700 dark:bg-zinc-950 md:bottom-6 md:right-6 md:max-h-[min(88dvh,720px)] md:w-[420px] md:max-w-[calc(100vw-2rem)] md:rounded-2xl md:border"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              style={{ maxHeight: "min(92dvh, 720px)" }}
            >
              <div className="flex shrink-0 items-center justify-between border-b border-zinc-200/90 px-4 py-3 dark:border-zinc-800">
                <div>
                  <h3 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                    {UI.assistantTitle}
                  </h3>
                  <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">{UI.assistantSubtitle}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-200/80 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  aria-label={UI.closeAria}
                >
                  {"\u2715"}
                </button>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
                {!hasLead ? (
                  <div className="rounded-xl border border-dashed border-zinc-300 bg-white/60 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-600 dark:bg-zinc-900/40 dark:text-zinc-400">
                    {UI.openDetailHint}
                  </div>
                ) : null}

                {hasLead ? (
                  <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[11px] text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-300">
                    <span className="font-semibold text-zinc-800 dark:text-zinc-100">{lead!.base.name}</span>
                    <span className="text-zinc-400 dark:text-zinc-500">{" \u00b7 "}</span>
                    {lead!.counselingStatus}
                    <span className="text-zinc-400 dark:text-zinc-500">{" \u00b7 "}</span>
                    {lead!.base.ownerStaff}
                  </div>
                ) : null}

                {errorText ? (
                  <div
                    className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900 dark:border-rose-500/30 dark:bg-rose-950/40 dark:text-rose-100"
                    role="alert"
                  >
                    {errorText}
                  </div>
                ) : null}

                {loading ? (
                  <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900/60">
                    <span className="inline-flex gap-1">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-sky-500 [animation-delay:-0.2s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-sky-500 [animation-delay:-0.1s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-sky-500" />
                    </span>
                    <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">{UI.analyzing}</span>
                  </div>
                ) : null}

                {!loading && !result && hasLead && !errorText ? (
                  <div className="rounded-xl border border-dashed border-zinc-300 bg-white/50 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-600 dark:bg-zinc-900/30 dark:text-zinc-400">
                    {UI.emptyPrompt}
                  </div>
                ) : null}

                {result ? (
                  <div className="space-y-3 pb-2">
                    <SectionCard title={UI.sectionSummary}>
                      <ul className="list-inside list-disc space-y-1.5 text-sm leading-relaxed text-zinc-800 dark:text-zinc-100">
                        {result.summary.map((line, i) => (
                          <li key={i} className="marker:text-sky-500">
                            {line}
                          </li>
                        ))}
                      </ul>
                    </SectionCard>

                    <SectionCard title={UI.sectionStage}>
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{result.customerStage}</p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {result.riskSignals.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border border-amber-200/90 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-100"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                      <div className="mt-4 space-y-3">
                        <ScoreBar label={UI.scoreContract} value={result.purchaseIntentScore} />
                        <ScoreBar label={UI.scorePrice} value={result.priceSensitivityScore} />
                        <ScoreBar label={UI.scoreGhost} value={result.responseRiskScore} />
                      </div>
                    </SectionCard>

                    <SectionCard title={UI.sectionActions}>
                      <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">{result.recommendedAction}</p>
                      <ul className="mt-2 list-inside list-decimal space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
                        {result.recommendedActions.map((a, i) => (
                          <li key={i}>{a}</li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        onClick={() => void copyText(result.recommendedAction, "action")}
                        className="mt-3 w-full rounded-lg border border-zinc-300 bg-white py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                      >
                        {copyFlash === "action" ? UI.copied : UI.copyAction}
                      </button>
                    </SectionCard>

                    <SectionCard title={UI.sectionMessages}>
                      <div className="space-y-3">
                        {result.messageSuggestions.map((m) => (
                          <div
                            key={m.tone}
                            className="rounded-lg border border-zinc-200 bg-zinc-50/90 p-3 dark:border-zinc-700 dark:bg-zinc-900/70"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-bold text-sky-700 dark:text-sky-300">{m.tone}</span>
                              <button
                                type="button"
                                onClick={() => void copyText(m.text, m.tone)}
                                className="shrink-0 rounded-md bg-sky-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-sky-700"
                              >
                                {copyFlash === m.tone ? UI.copied : UI.copy}
                              </button>
                            </div>
                            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-800 dark:text-zinc-100">
                              {m.text}
                            </p>
                          </div>
                        ))}
                      </div>
                    </SectionCard>
                  </div>
                ) : null}
              </div>

              <div className="shrink-0 space-y-2 border-t border-zinc-200 bg-white/90 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/90">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!hasLead || loading}
                    onClick={() => void runAnalysis()}
                    className="flex-1 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 py-2.5 text-sm font-semibold text-white shadow-md shadow-sky-900/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {UI.analyze}
                  </button>
                  <button
                    type="button"
                    disabled={!hasLead || loading || !result}
                    onClick={() => void runAnalysis()}
                    className="rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-900"
                  >
                    {UI.regenerate}
                  </button>
                </div>
                <p className="text-[10px] leading-snug text-zinc-500 dark:text-zinc-500">{UI.footerNote}</p>
              </div>
            </motion.section>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}
