"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { useNotifications } from "@/app/_components/notifications/NotificationProvider";
import type { AiSecretaryTabKey } from "./events";
import AiChatTab from "./AiChatTab";
import AiQueueTab from "./AiQueueTab";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function AiSecretaryPanel({
  open,
  activeTab,
  currentLeadId,
  onClose,
  onChangeTab,
}: {
  open: boolean;
  activeTab: AiSecretaryTabKey;
  currentLeadId?: string | null;
  onClose: () => void;
  onChangeTab: (tab: AiSecretaryTabKey) => void;
}) {
  const { items, deleteOne, deleteAll } = useNotifications();
  const [seedPrompt, setSeedPrompt] = useState<string | null>(null);
  const tabs: Array<{ key: AiSecretaryTabKey; label: string }> = useMemo(
    () => [
      { key: "chat", label: "빠른 상담" },
      { key: "queue", label: "오늘의 큐" },
      { key: "alerts", label: "알림" },
    ],
    []
  );

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-[95] bg-black/25" onClick={onClose} aria-hidden />
      <aside className="fixed right-0 top-0 z-[96] h-dvh w-full max-w-[380px] border-l border-zinc-200 bg-zinc-50 shadow-2xl dark:border-zinc-700 dark:bg-zinc-950">
        <div className="flex h-full flex-col">
          <div className="border-b border-zinc-200 bg-[#1e40af] px-4 py-3 text-white dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Image src="/images/nowcar-ai-logo.png" alt="나우AI" width={24} height={24} className="rounded-full bg-white object-contain p-0.5" />
                나우AI
              </h2>
              <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-sm hover:bg-white/20">
                닫기
              </button>
            </div>
            <div className="mt-3 flex gap-1 rounded-xl bg-white/20 p-1">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => onChangeTab(tab.key)}
                  className={cn(
                    "rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors",
                    activeTab === tab.key ? "bg-white text-[#1e40af]" : "text-white/90 hover:bg-white/20"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 p-3">
            {activeTab === "chat" ? (
              <AiChatTab
                currentLeadId={currentLeadId}
                externalSeedPrompt={seedPrompt}
                onSeedPromptConsumed={() => setSeedPrompt(null)}
              />
            ) : null}
            {activeTab === "queue" ? (
              <AiQueueTab
                onRequestMent={(nextSeedPrompt) => {
                  setSeedPrompt(nextSeedPrompt);
                  onChangeTab("chat");
                }}
              />
            ) : null}
            {activeTab === "alerts" ? (
              <div className="min-h-0 space-y-2 overflow-y-auto pr-1">
                <div className="flex justify-end">
                  <button
                    type="button"
                    className="rounded-md border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-600"
                    onClick={() => {
                      if (window.confirm("알림을 모두 삭제할까요?")) void deleteAll();
                    }}
                  >
                    전체 삭제
                  </button>
                </div>
                {items.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-zinc-300 bg-white/80 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400">
                    최근 알림이 없습니다.
                  </div>
                ) : (
                  items.map((item) => (
                    <div key={item.id} className="group rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900/60">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{item.title}</div>
                          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">{item.message}</p>
                        </div>
                        <button
                          type="button"
                          className="invisible rounded px-1 text-xs text-rose-600 hover:bg-rose-50 group-hover:visible"
                          onClick={() => void deleteOne(item.id)}
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : null}
          </div>
        </div>
      </aside>
    </>
  );
}
