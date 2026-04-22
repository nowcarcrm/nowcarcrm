export type RateTemplate = {
  id: string;
  user_id: string;
  base_rate: number;
  eligible_incentive: boolean;
  incentive_per_tier_percent: number;
  include_sliding: boolean;
  is_excluded: boolean;
  special_note: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

export type RateTemplateWithUser = RateTemplate & {
  user_name: string;
  user_email: string;
  user_rank: string;
  user_team_name: string | null;
  user_division_name: string | null;
  updated_by_name: string | null;
};

export type MonthlyRate = {
  id: string;
  user_id: string;
  rate_month: string;
  base_rate: number;
  eligible_incentive: boolean;
  incentive_per_tier_percent: number;
  include_sliding: boolean;
  is_excluded: boolean;
  created_at: string;
  created_by: string | null;
};

export type DeliveryStatus =
  | "draft"
  | "pending_leader"
  | "approved_leader"
  | "pending_director"
  | "approved_director"
  | "modilca_submitted"
  | "confirmed"
  | "carried_over"
  | "finalized";

export type Delivery = {
  id: string;
  owner_id: string;
  created_by: string;
  team_name: string | null;
  lead_id: number | null;
  financial_company: string;
  product_type: "rent" | "lease";
  contract_date: string | null;
  delivery_date: string;
  registration_date: string | null;
  customer_name: string;
  car_model: string;
  car_price: number;
  ag_commission: number;
  dealer_commission: number | null;
  etc_revenue: number;
  customer_support: number;
  delivery_type: "special" | "dealer";
  dealer_name: string | null;
  dealer_contract_no: string | null;
  status: DeliveryStatus;
  ag_settlement_month: string | null;
  dealer_settlement_month: string | null;
  notes: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type DeliveryWithNames = Delivery & {
  owner_name: string;
  owner_email: string;
  created_by_name: string;
};

export type DeliveryCreateInput = {
  owner_id: string;
  lead_id?: number | null;
  financial_company: string;
  product_type: "rent" | "lease";
  contract_date?: string | null;
  delivery_date: string;
  registration_date?: string | null;
  customer_name: string;
  car_model: string;
  car_price: number;
  ag_commission: number;
  etc_revenue?: number;
  customer_support?: number;
  delivery_type: "special" | "dealer";
  dealer_name?: string | null;
  dealer_contract_no?: string | null;
  notes?: string | null;
};

export type DeliveryUpdateInput = Partial<DeliveryCreateInput> & {
  version: number;
};

export type ApprovalAction = "submit" | "approve" | "reject" | "reopen" | "confirm" | "carry_over";

export type Approval = {
  id: string;
  delivery_id: string;
  approver_id: string;
  approver_name: string;
  approver_rank: string;
  approval_level: "submitter" | "team_leader" | "director" | "super_admin";
  action: ApprovalAction;
  notes: string | null;
  created_at: string;
};

export type MonthlyReport = {
  id: string;
  user_id: string;
  rate_month: string;
  total_ag_commission: number;
  total_dealer_commission: number;
  total_etc_revenue: number;
  total_revenue: number;
  total_customer_support: number;
  net_revenue: number;
  base_rate: number;
  eligible_incentive: boolean;
  incentive_tier: number;
  incentive_rate: number;
  rate_based_amount: number;
  support_50_amount: number;
  adjustment_amount: number;
  final_amount: number;
  status: "draft" | "confirmed" | "paid";
  confirmed_at: string | null;
  confirmed_by: string | null;
  paid_at: string | null;
  locked_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MonthlyReportWithUser = MonthlyReport & {
  user_name: string;
  user_email: string;
  user_rank: string;
  user_team_name: string | null;
};

export type Adjustment = {
  id: string;
  report_id: string;
  amount: number;
  reason: string;
  related_month: string | null;
  created_at: string;
  created_by: string;
};
