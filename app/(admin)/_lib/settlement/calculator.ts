export type SettlementCalculationInput = {
  total_ag_commission: number;
  total_dealer_commission: number;
  total_etc_revenue: number;
  total_customer_support: number;
  base_rate: number;
  eligible_incentive: boolean;
  incentive_per_tier_percent: number;
  is_excluded: boolean;
  adjustment_amount?: number;
  total_prepayment_applied?: number;
};

export type SettlementCalculationOutput = {
  total_revenue: number;
  net_revenue: number;
  incentive_tier: number;
  incentive_rate: number;
  applied_rate: number;
  rate_based_amount: number;
  support_50_amount: number;
  adjustment_amount: number;
  prepayment_amount: number;
  final_amount: number;
};

function asMoney(n: number | null | undefined): number {
  return Math.round(Number(n ?? 0));
}

export function calculateSettlement(input: SettlementCalculationInput): SettlementCalculationOutput {
  if (input.is_excluded) {
    return {
      total_revenue: 0,
      net_revenue: 0,
      incentive_tier: 0,
      incentive_rate: 0,
      applied_rate: 0,
      rate_based_amount: 0,
      support_50_amount: 0,
      adjustment_amount: 0,
      prepayment_amount: 0,
      final_amount: 0,
    };
  }

  const totalAg = asMoney(input.total_ag_commission);
  const totalDealer = asMoney(input.total_dealer_commission);
  const totalEtc = asMoney(input.total_etc_revenue);
  const totalSupport = asMoney(input.total_customer_support);
  const baseRate = Number(input.base_rate ?? 0);
  const tierPercent = Number(input.incentive_per_tier_percent ?? 0);
  const adjustment = asMoney(input.adjustment_amount ?? 0);
  const prepayment = asMoney(input.total_prepayment_applied ?? 0);

  const total_revenue = totalAg + totalDealer + totalEtc;
  const net_revenue = total_revenue - totalSupport;

  let incentive_tier = 0;
  let incentive_rate = 0;
  if (input.eligible_incentive && net_revenue >= 10_000_000) {
    incentive_tier = Math.floor(net_revenue / 10_000_000);
    incentive_rate = incentive_tier * tierPercent;
  }

  const applied_rate = baseRate + incentive_rate;
  const rate_based_amount = Math.round((total_revenue * applied_rate) / 100);
  const support_50_amount = Math.round(totalSupport * 0.5 * 1.1);
  const final_amount = rate_based_amount + support_50_amount + adjustment - prepayment;

  return {
    total_revenue,
    net_revenue,
    incentive_tier,
    incentive_rate,
    applied_rate,
    rate_based_amount,
    support_50_amount,
    adjustment_amount: adjustment,
    prepayment_amount: prepayment,
    final_amount,
  };
}
