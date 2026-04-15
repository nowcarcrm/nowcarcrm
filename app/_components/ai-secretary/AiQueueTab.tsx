"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/(admin)/_lib/supabaseClient";
import { useAuth } from "@/app/_components/auth/AuthProvider";

type QueueItem = {
  rank: number;
  leadId: string;
  customerName: string;
  carModel: string;
  temperature: "HOT" | "WARM" | "COLD" | "DEAD";
  nextAction: string;
};

function maskName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "고객";
  if (trimmed.length === 1) return `${trimmed}*`;
  if (trimmed.length === 2) return `${trimmed[0]}*`;
  return `${trimmed[0]}${"*".repeat(Math.max(1, trimmed.length - 2))}${trimmed[trimmed.length - 1]}`;
}

export default function AiQueueTab({
  onRequestMent,
}: {
  onRequestMent: (seedPrompt: string) => void;
}) {
  const router = useRouter();
  const { profile } = useAuth();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!profile?.userId) return;
    let mounted = true;
    setLoading(true);
    void (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token ?? "";
        if (!token) return;
        const res = await fetch(`/api/ai/daily-queue?userId=${encodeURIComponent(profile.userId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = (await res.json()) as { ok?: boolean; queue?: QueueItem[] };
        if (!mounted || !json.ok) return;
        setQueue(json.queue ?? []);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [profile?.userId]);

  const topItems = useMemo(() => queue.slice(0, 10), [queue]);

  return (
    <div className="min-h-0 space-y-3 overflow-y-auto pr-1">
      {loading ? (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-700 dark:border-sky-400/30 dark:bg-sky-500/10 dark:text-sky-200">
          오늘의 큐를 불러오는 중...
        </div>
      ) : null}

      {!loading && topItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white/80 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400">
          오늘 우선순위 고객이 없습니다.
        </div>
      ) : null}

      {topItems.map((item) => (
        <div key={item.leadId} className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900/60">
          <div className="flex items-center justify-between gap-2">
            <div className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              #{item.rank} {maskName(item.customerName)} · {item.carModel || "차종 미입력"}
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                item.temperature === "HOT"
                  ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200"
                  : item.temperature === "WARM"
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200"
                    : "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200"
              }`}
            >
              {item.temperature === "HOT" ? "HOT 🔥" : item.temperature === "WARM" ? "WARM 🟡" : "COLD 🔵"}
            </span>
          </div>

          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">{item.nextAction || "팔로업 필요"}</p>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                onRequestMent(
                  `${item.customerName} 고객에게 보낼 멘트를 만들어줘. 차종은 ${item.carModel || "미입력"}이고, 우선 액션은 "${item.nextAction}"야.`
                )
              }
              className="rounded-lg bg-sky-600 px-2.5 py-1.5 text-xs font-semibold text-white"
            >
              멘트 생성
            </button>
            <button
              type="button"
              onClick={() => router.push(`/leads/counseling-progress?leadId=${encodeURIComponent(item.leadId)}`)}
              className="rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-semibold dark:border-zinc-600"
            >
              상세보기
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
