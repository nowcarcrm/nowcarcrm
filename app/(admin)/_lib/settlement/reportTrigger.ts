import { logSettlementAudit } from "./auditLog";
import { upsertMonthlyReport } from "./aggregator";

export async function triggerReportRecompute(opts: {
  deliveryId: string;
  ownerId: string;
  agMonth: string | null;
  dealerMonth: string | null;
  performedBy: string;
}) {
  const months = new Set<string>();
  if (opts.agMonth) months.add(opts.agMonth);
  if (opts.dealerMonth) months.add(opts.dealerMonth);

  const results: Array<{ month: string; success: boolean; error?: string }> = [];
  for (const month of months) {
    try {
      const result = await upsertMonthlyReport(opts.ownerId, month, opts.performedBy);
      if (!result.ok) {
        results.push({ month, success: false, error: String(result.error) });
        continue;
      }
      results.push({ month, success: true });
      await logSettlementAudit({
        action: "report_auto_recomputed",
        entityType: "monthly_report",
        targetUserId: opts.ownerId,
        performedBy: opts.performedBy,
        details: {
          trigger: "delivery_change",
          delivery_id: opts.deliveryId,
          month,
        },
      });
    } catch (e) {
      results.push({ month, success: false, error: String(e) });
      console.error("[RECOMPUTE FAIL]", e);
    }
  }
  return results;
}
