import type { AiCounselAnalysisRecord } from "./counselAssistShared";

/**
 * Storage-ready service boundary.
 * TODO: replace stubs with Supabase insert/select when ai_counsel_analysis table is added.
 */
export async function saveAiCounselAnalysisDraft(_record: AiCounselAnalysisRecord): Promise<void> {
  // Intentionally no-op for phase 2. Keeps call sites stable for future DB persistence.
}

export async function listAiCounselAnalysisHistory(_leadId: string): Promise<AiCounselAnalysisRecord[]> {
  // Intentionally no-op for phase 2. Returns empty until DB table is wired.
  return [];
}
