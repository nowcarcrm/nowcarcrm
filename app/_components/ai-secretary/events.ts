export const NOW_AI_OPEN_EVENT = "nowcar:now-ai-open";

export type AiSecretaryTabKey = "chat" | "queue" | "alerts";

export type NowAiOpenDetail = {
  tab?: AiSecretaryTabKey;
  leadId?: string;
  leadSummary?: {
    name?: string;
    desiredVehicle?: string;
    source?: string;
    temperature?: string;
  };
};

export function openNowAi(detail: NowAiOpenDetail = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(NOW_AI_OPEN_EVENT, { detail }));
}

// Backward compatibility for existing callers.
export function openAiSecretary(tab: AiSecretaryTabKey = "chat") {
  openNowAi({ tab });
}
