/* eslint-disable @typescript-eslint/no-explicit-any */
import { getSettlementMonth, getMonthRange } from "@/app/(admin)/_lib/settlement/formatters";
import {
  canEditDelivery as canEditDeliveryByStatus,
  getDeliveryScope,
  isCeo,
  isDirector,
  isSettlementManager,
  isTeamLeader,
} from "@/app/(admin)/_lib/settlement/permissions";
import { isSuperAdmin } from "@/app/(admin)/_lib/rolePermissions";
import type { Delivery, DeliveryCreateInput, DeliveryUpdateInput, DeliveryWithNames } from "@/app/(admin)/_types/settlement";
import { logSettlementAudit } from "@/app/(admin)/_lib/settlement/auditLog";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";

export type Requester = {
  id: string;
  role: string;
  rank?: string | null;
  team_name?: string | null;
  email?: string | null;
  name?: string | null;
};

export function normalizeMoney(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

export function getChangedFields(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const changed: string[] = [];
  for (const key of Object.keys(after)) {
    if (before[key] !== after[key]) changed.push(key);
  }
  return changed;
}

export function canAssignOwner(currentUser: Requester, ownerTeamName: string | null, ownerId: string): boolean {
  if (ownerId === currentUser.id) return true;
  if (isSuperAdmin(currentUser) || isCeo(currentUser) || isDirector(currentUser)) return true;
  if (isTeamLeader(currentUser)) {
    const myTeam = (currentUser.team_name ?? "").trim();
    return !!myTeam && ownerTeamName === myTeam;
  }
  return false;
}

export function canReadDelivery(currentUser: Requester, delivery: Delivery): boolean {
  const scope = getDeliveryScope(currentUser);
  if (scope.scope === "all") return true;
  if (scope.scope === "team") return delivery.team_name === scope.team_name;
  return delivery.owner_id === scope.user_id;
}

export function canEditDelivery(currentUser: Requester, delivery: Delivery): boolean {
  return canEditDeliveryByStatus(currentUser, delivery);
}

export function canDeleteDelivery(currentUser: Requester, delivery: Delivery): boolean {
  if (isSuperAdmin(currentUser)) return true;
  const earlyStatus = delivery.status === "draft" || delivery.status === "pending_leader" || delivery.status === "pending_director";
  if ((isCeo(currentUser) || isDirector(currentUser)) && earlyStatus) return true;
  if (isTeamLeader(currentUser) && delivery.team_name === (currentUser.team_name ?? "") && delivery.status === "draft") return true;
  return delivery.owner_id === currentUser.id && delivery.status === "draft";
}

export async function fetchUsersByIds(ids: string[]) {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return new Map<string, { name: string; email: string; team_name: string | null }>();
  const { data } = await supabaseAdmin
    .from("users")
    .select("id,name,email,team_name")
    .in("id", unique);
  const map = new Map<string, { name: string; email: string; team_name: string | null }>();
  for (const row of (data ?? []) as Array<any>) {
    map.set(String(row.id), {
      name: String(row.name ?? "").trim() || "(이름없음)",
      email: String(row.email ?? "").trim(),
      team_name: row.team_name == null ? null : String(row.team_name),
    });
  }
  return map;
}

export async function mapDeliveriesWithNames(rows: Delivery[]): Promise<DeliveryWithNames[]> {
  const ids = rows.flatMap((r) => [r.owner_id, r.created_by]);
  const userMap = await fetchUsersByIds(ids);
  return rows.map((r) => {
    const owner = userMap.get(r.owner_id);
    const creator = userMap.get(r.created_by);
    return {
      ...r,
      owner_name: owner?.name ?? "(알수없음)",
      owner_email: owner?.email ?? "",
      created_by_name: creator?.name ?? "(알수없음)",
    };
  });
}

export function toDeliveryRow(input: DeliveryCreateInput | DeliveryUpdateInput) {
  const anyInput = input as any;
  const deliveryDate = String(anyInput.delivery_date ?? "").trim();
  const agMonth = deliveryDate ? getSettlementMonth(deliveryDate) : null;
  return {
    lead_id: anyInput.lead_id ?? null,
    financial_company: String(anyInput.financial_company ?? "").trim(),
    product_type: anyInput.product_type,
    contract_date: anyInput.contract_date ?? null,
    delivery_date: deliveryDate,
    registration_date: anyInput.registration_date ?? null,
    customer_name: String(anyInput.customer_name ?? "").trim(),
    car_model: String(anyInput.car_model ?? "").trim(),
    car_price: normalizeMoney(anyInput.car_price),
    ag_commission: normalizeMoney(anyInput.ag_commission),
    etc_revenue: normalizeMoney(anyInput.etc_revenue ?? 0),
    customer_support: normalizeMoney(anyInput.customer_support ?? 0),
    delivery_type: anyInput.delivery_type,
    dealer_name: anyInput.dealer_name ?? null,
    dealer_contract_no: anyInput.dealer_contract_no ?? null,
    notes: anyInput.notes ?? null,
    ag_settlement_month: agMonth,
  };
}

export function monthRangeFilter(month: string) {
  return getMonthRange(month);
}

export async function ensureOwnerTemplate(ownerId: string) {
  const { data } = await supabaseAdmin
    .from("settlement_rate_templates")
    .select("id,is_excluded")
    .eq("user_id", ownerId)
    .maybeSingle();
  return data as { id: string; is_excluded: boolean } | null;
}

export async function appendAuditForCreate(created: Delivery, requesterId: string, warning?: string) {
  await logSettlementAudit({
    action: "delivery_created",
    entityType: "delivery",
    entityId: created.id,
    targetUserId: created.owner_id,
    performedBy: requesterId,
    details: { after: created, warning: warning ?? null },
  });
}
