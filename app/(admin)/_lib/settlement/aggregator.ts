import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";
import { calculateSettlement } from "./calculator";
import type { PostgrestError } from "@supabase/supabase-js";
import type { MonthlyReport } from "../../_types/settlement";

const REPORTABLE_STATUSES = ["approved_director", "modilca_submitted", "confirmed"];

type DeliveryMoneyRow = {
  ag_commission: number | null;
  etc_revenue: number | null;
  customer_support: number | null;
};

type DealerMoneyRow = {
  dealer_commission: number | null;
};

type RateRow = {
  base_rate: number;
  eligible_incentive: boolean;
  incentive_per_tier_percent: number;
  is_excluded: boolean;
  _fallback?: boolean;
};

function asMoney(v: unknown): number {
  return Math.round(Number(v ?? 0));
}

async function fetchMonthlyAggregation(userId: string, month: string) {
  const { data: agDeliveries } = await supabaseAdmin
    .from("settlement_deliveries")
    .select("ag_commission,etc_revenue,customer_support")
    .eq("owner_id", userId)
    .eq("ag_settlement_month", month)
    .in("status", REPORTABLE_STATUSES)
    .is("deleted_at", null);

  const { data: dealerDeliveries } = await supabaseAdmin
    .from("settlement_deliveries")
    .select("dealer_commission")
    .eq("owner_id", userId)
    .eq("dealer_settlement_month", month)
    .in("status", REPORTABLE_STATUSES)
    .is("deleted_at", null);

  const total_ag_commission = ((agDeliveries ?? []) as DeliveryMoneyRow[]).reduce((sum, d) => sum + asMoney(d.ag_commission), 0);
  const total_etc_revenue = ((agDeliveries ?? []) as DeliveryMoneyRow[]).reduce((sum, d) => sum + asMoney(d.etc_revenue), 0);
  const total_customer_support = ((agDeliveries ?? []) as DeliveryMoneyRow[]).reduce(
    (sum, d) => sum + asMoney(d.customer_support),
    0
  );
  const total_dealer_commission = ((dealerDeliveries ?? []) as DealerMoneyRow[]).reduce(
    (sum, d) => sum + asMoney(d.dealer_commission),
    0
  );

  return {
    total_ag_commission,
    total_dealer_commission,
    total_etc_revenue,
    total_customer_support,
    ag_delivery_count: agDeliveries?.length ?? 0,
    dealer_delivery_count: dealerDeliveries?.length ?? 0,
  };
}

async function fetchAdjustmentSum(reportId: string): Promise<number> {
  const { data } = await supabaseAdmin.from("settlement_adjustments").select("amount").eq("report_id", reportId);
  return (data ?? []).reduce((sum, a) => sum + asMoney((a as { amount?: number | null }).amount), 0);
}

async function fetchPrepaymentSum(userId: string, month: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from("settlement_prepayments")
    .select("amount")
    .eq("target_user_id", userId)
    .eq("target_month", month)
    .eq("applied", false);
  return (data ?? []).reduce((sum, p) => sum + asMoney((p as { amount?: number | null }).amount), 0);
}

async function fetchApplicableRate(userId: string, month: string): Promise<RateRow | null> {
  const { data: monthlyRate } = await supabaseAdmin
    .from("settlement_monthly_rates")
    .select("base_rate,eligible_incentive,incentive_per_tier_percent,is_excluded")
    .eq("user_id", userId)
    .eq("rate_month", month)
    .maybeSingle();
  if (monthlyRate) return monthlyRate as RateRow;

  const { data: template } = await supabaseAdmin
    .from("settlement_rate_templates")
    .select("base_rate,eligible_incentive,incentive_per_tier_percent,is_excluded")
    .eq("user_id", userId)
    .maybeSingle();
  if (!template) return null;
  return { ...(template as RateRow), _fallback: true };
}

export async function computeUserSettlement(userId: string, month: string) {
  const rate = await fetchApplicableRate(userId, month);
  if (!rate) return { error: "요율 설정 없음", userId, month } as const;

  const aggregation = await fetchMonthlyAggregation(userId, month);
  const { data: existingReport } = await supabaseAdmin
    .from("settlement_monthly_reports")
    .select("id,status")
    .eq("user_id", userId)
    .eq("rate_month", month)
    .maybeSingle();

  const adjustmentAmount = existingReport?.id ? await fetchAdjustmentSum(String(existingReport.id)) : 0;
  const totalPrepayment = await fetchPrepaymentSum(userId, month);
  const calculation = calculateSettlement({
    ...aggregation,
    base_rate: Number(rate.base_rate),
    eligible_incentive: !!rate.eligible_incentive,
    incentive_per_tier_percent: Number(rate.incentive_per_tier_percent ?? 5),
    is_excluded: !!rate.is_excluded,
    adjustment_amount: adjustmentAmount,
    total_prepayment_applied: totalPrepayment,
  });

  return {
    userId,
    month,
    aggregation,
    rate: {
      base_rate: Number(rate.base_rate),
      eligible_incentive: !!rate.eligible_incentive,
      is_excluded: !!rate.is_excluded,
      is_fallback: !!rate._fallback,
      incentive_per_tier_percent: Number(rate.incentive_per_tier_percent ?? 5),
    },
    calculation,
    existingReport: (existingReport ?? null) as { id: string; status: MonthlyReport["status"] } | null,
  } as const;
}

type UpsertMonthlyReportResult =
  | { ok: false; error: string; userId: string; month: string }
  | { ok: false; error: PostgrestError; userId: string; month: string }
  | {
      ok: true;
      data: MonthlyReport | null;
      calculation: ReturnType<typeof calculateSettlement>;
      userId: string;
      month: string;
    };

export async function upsertMonthlyReport(userId: string, month: string, _performedBy: string) {
  const result = await computeUserSettlement(userId, month);
  if ("error" in result) return { ok: false, error: result.error, userId, month } as UpsertMonthlyReportResult;
  if (result.existingReport?.status === "confirmed") {
    return {
      ok: false,
      error: "이미 확정된 월은 재계산할 수 없습니다. 재오픈 필요.",
      userId,
      month,
    } as UpsertMonthlyReportResult;
  }

  const { aggregation, rate, calculation } = result;
  const reportData = {
    user_id: userId,
    rate_month: month,
    total_ag_commission: aggregation.total_ag_commission,
    total_dealer_commission: aggregation.total_dealer_commission,
    total_etc_revenue: aggregation.total_etc_revenue,
    total_revenue: calculation.total_revenue,
    total_customer_support: aggregation.total_customer_support,
    net_revenue: calculation.net_revenue,
    base_rate: rate.base_rate,
    eligible_incentive: rate.eligible_incentive,
    incentive_tier: calculation.incentive_tier,
    incentive_rate: calculation.incentive_rate,
    rate_based_amount: calculation.rate_based_amount,
    support_50_amount: calculation.support_50_amount,
    adjustment_amount: calculation.adjustment_amount,
    prepayment_amount: calculation.prepayment_amount,
    final_amount: calculation.final_amount,
    status: "draft",
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from("settlement_monthly_reports")
    .upsert(reportData, { onConflict: "user_id,rate_month" })
    .select("*")
    .maybeSingle();
  if (error) return { ok: false, error, userId, month } as UpsertMonthlyReportResult;
  return { ok: true, data: (data as MonthlyReport | null) ?? null, calculation, userId, month } as UpsertMonthlyReportResult;
}
