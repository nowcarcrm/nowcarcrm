import cron from "node-cron";
import { detectAiAlerts, runDailyAiBatch } from "@/app/_lib/aiBatchAnalysis";

declare global {
  // eslint-disable-next-line no-var
  var __NOWCAR_AI_SCHEDULER_STARTED__: boolean | undefined;
}

export function ensureAiSchedulersStarted() {
  if (globalThis.__NOWCAR_AI_SCHEDULER_STARTED__) return;
  globalThis.__NOWCAR_AI_SCHEDULER_STARTED__ = true;

  cron.schedule("0 6 * * *", () => {
    void runDailyAiBatch().catch((error) => {
      console.error("[ai-scheduler] daily batch failed", error);
    });
  });

  cron.schedule("*/30 * * * *", () => {
    void detectAiAlerts().catch((error) => {
      console.error("[ai-scheduler] alert detection failed", error);
    });
  });
}
