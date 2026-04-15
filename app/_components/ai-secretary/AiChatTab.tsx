"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/app/(admin)/_lib/supabaseClient";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const QUICK_PROMPTS = [
  "이 고객한테 뭐라고 해?",
  "클로징 멘트 만들어줘",
  "경쟁사 대응법",
  "할인 요청 대응 방법",
  "장기 미응답 고객 재연락 멘트",
];

export default function AiChatTab({
  currentLeadId,
  externalSeedPrompt,
  onSeedPromptConsumed,
}: {
  currentLeadId?: string | null;
  externalSeedPrompt?: string | null;
  onSeedPromptConsumed?: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");

  const canSend = useMemo(() => !loading && input.trim().length > 0, [input, loading]);

  const sendMessage = async (raw: string) => {
    const message = raw.trim();
    if (!message || loading) return;

    setLoading(true);
    setErrorText("");

    const nextHistory: ChatMessage[] = [...messages, { role: "user", content: message }];
    setMessages(nextHistory);
    setInput("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      if (!token) {
        throw new Error("세션이 만료되었습니다. 다시 로그인해 주세요.");
      }

      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message,
          conversationHistory: nextHistory.slice(0, -1),
          currentLeadId: currentLeadId ?? undefined,
        }),
      });

      const data = (await response.json()) as {
        ok?: boolean;
        reply?: string;
        error?: string;
      };

      if (!response.ok || !data.ok || !data.reply) {
        throw new Error(data.error ?? "AI 응답을 가져오지 못했습니다.");
      }

      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "AI 요청에 실패했습니다.";
      setErrorText(messageText);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!externalSeedPrompt) return;
    void sendMessage(externalSeedPrompt);
    onSeedPromptConsumed?.();
    // Runs only for newly injected prompts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalSeedPrompt]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex flex-wrap gap-2">
        {QUICK_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => void sendMessage(prompt)}
            disabled={loading}
            className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-100 disabled:opacity-60"
          >
            {prompt}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-3">
        {messages.length === 0 ? (
          <div className="rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
            상담 중 막히는 내용을 나우AI에게 바로 물어보세요.
          </div>
        ) : null}

        {messages.map((msg, index) => (
          <div
            key={`${msg.role}-${index}`}
            className={`max-w-[92%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
              msg.role === "user" ? "ml-auto bg-sky-600 text-white" : "bg-zinc-100 text-zinc-900"
            }`}
          >
            {msg.content}
          </div>
        ))}

        {loading ? (
          <div className="inline-flex items-center gap-2 rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-700">
            <span className="size-3 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
            답변 작성 중...
          </div>
        ) : null}
      </div>

      {errorText ? (
        <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {errorText}
        </div>
      ) : null}

      <form
        className="mt-3 flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void sendMessage(input);
        }}
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="AI에게 물어보세요..."
          className="crm-field h-10 flex-1 text-sm"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={!canSend}
          className="rounded-xl bg-sky-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          전송
        </button>
      </form>
    </div>
  );
}
