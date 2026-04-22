import { calculateSettlement } from "./calculator";

const case1 = calculateSettlement({
  total_ag_commission: 15_000_000,
  total_dealer_commission: 8_000_000,
  total_etc_revenue: 0,
  total_customer_support: 3_000_000,
  base_rate: 40.0,
  eligible_incentive: true,
  incentive_per_tier_percent: 5.0,
  is_excluded: false,
});
console.assert(case1.total_revenue === 23_000_000, "Case1 total_revenue");
console.assert(case1.net_revenue === 20_000_000, "Case1 net_revenue");
console.assert(case1.incentive_tier === 2, "Case1 incentive_tier");
console.assert(case1.incentive_rate === 10, "Case1 incentive_rate");
console.assert(case1.applied_rate === 50, "Case1 applied_rate");
console.assert(case1.rate_based_amount === 11_500_000, "Case1 rate_based_amount");
console.assert(case1.support_50_amount === 1_650_000, "Case1 support_50_amount");
console.assert(case1.final_amount === 13_150_000, "Case1 final_amount");

const case2 = calculateSettlement({
  total_ag_commission: 15_000_000,
  total_dealer_commission: 8_000_000,
  total_etc_revenue: 0,
  total_customer_support: 3_000_000,
  base_rate: 45.0,
  eligible_incentive: false,
  incentive_per_tier_percent: 5.0,
  is_excluded: false,
});
console.assert(case2.incentive_tier === 0, "Case2 no incentive");
console.assert(case2.applied_rate === 45, "Case2 applied_rate");
console.assert(case2.rate_based_amount === 10_350_000, "Case2 rate_based_amount");
console.assert(case2.final_amount === 12_000_000, "Case2 final_amount");

const case3 = calculateSettlement({
  total_ag_commission: 9_999_999,
  total_dealer_commission: 0,
  total_etc_revenue: 0,
  total_customer_support: 0,
  base_rate: 40.0,
  eligible_incentive: true,
  incentive_per_tier_percent: 5.0,
  is_excluded: false,
});
console.assert(case3.incentive_tier === 0, "Case3 boundary tier=0");
console.assert(case3.incentive_rate === 0, "Case3 boundary rate=0");

const case4 = calculateSettlement({
  total_ag_commission: 10_000_000,
  total_dealer_commission: 0,
  total_etc_revenue: 0,
  total_customer_support: 0,
  base_rate: 40.0,
  eligible_incentive: true,
  incentive_per_tier_percent: 5.0,
  is_excluded: false,
});
console.assert(case4.incentive_tier === 1, "Case4 boundary tier=1");
console.assert(case4.incentive_rate === 5, "Case4 boundary rate=5");
console.assert(case4.applied_rate === 45, "Case4 applied_rate");
console.assert(case4.rate_based_amount === 4_500_000, "Case4 rate_based_amount");

const case5 = calculateSettlement({
  total_ag_commission: 15_000_000,
  total_dealer_commission: 8_000_000,
  total_etc_revenue: 0,
  total_customer_support: 3_000_000,
  base_rate: 0,
  eligible_incentive: false,
  incentive_per_tier_percent: 5.0,
  is_excluded: true,
});
console.assert(case5.final_amount === 0, "Case5 excluded = 0");

const case6Plus = calculateSettlement({
  total_ag_commission: 10_000_000,
  total_dealer_commission: 0,
  total_etc_revenue: 0,
  total_customer_support: 0,
  base_rate: 40.0,
  eligible_incentive: false,
  incentive_per_tier_percent: 5.0,
  is_excluded: false,
  adjustment_amount: 500_000,
});
console.assert(case6Plus.final_amount === 4_500_000, "Case6+ adjustment");

const case6Minus = calculateSettlement({
  total_ag_commission: 10_000_000,
  total_dealer_commission: 0,
  total_etc_revenue: 0,
  total_customer_support: 0,
  base_rate: 40.0,
  eligible_incentive: false,
  incentive_per_tier_percent: 5.0,
  is_excluded: false,
  adjustment_amount: -500_000,
});
console.assert(case6Minus.final_amount === 3_500_000, "Case6- adjustment");

console.log("✅ All test cases passed");
