import { isSuperAdmin, type UserRole } from "@/app/(admin)/_lib/rolePermissions";
import type { Delivery } from "@/app/(admin)/_types/settlement";

type SettlementUserLike = {
  id?: string | null;
  role?: UserRole | string | null;
  rank?: string | null;
  team_name?: string | null;
  email?: string | null;
};

export const RANK = {
  CEO: "대표",
  SUPER_CEO: "총괄대표",
  DIRECTOR: "본부장",
  LEADER: "팀장",
} as const;

export function isDirector(user: SettlementUserLike | null | undefined): boolean {
  if (!user) return false;
  return (user.rank ?? "").trim() === RANK.DIRECTOR;
}

export function isTeamLeader(user: SettlementUserLike | null | undefined): boolean {
  if (!user) return false;
  return (user.rank ?? "").trim() === RANK.LEADER;
}

export function isCeo(user: SettlementUserLike | null | undefined): boolean {
  if (!user) return false;
  const rank = (user.rank ?? "").trim();
  return rank === RANK.CEO || rank === RANK.SUPER_CEO;
}

export function isSettlementManager(user: SettlementUserLike | null | undefined): boolean {
  if (!user) return false;
  return isSuperAdmin(user) || isCeo(user) || isDirector(user) || isTeamLeader(user);
}

export type DeliveryScope =
  | { scope: "all" }
  | { scope: "team"; team_name: string }
  | { scope: "own"; user_id: string };

export function getDeliveryScope(user: SettlementUserLike): DeliveryScope {
  if (isSuperAdmin(user) || isCeo(user) || isDirector(user)) {
    return { scope: "all" };
  }
  const team = (user.team_name ?? "").trim();
  const uid = (user.id ?? "").trim();
  if (isTeamLeader(user) && team) {
    return { scope: "team", team_name: team };
  }
  return { scope: "own", user_id: uid };
}

export function canEditDelivery(user: SettlementUserLike | null | undefined, delivery: Delivery): boolean {
  if (!user) return false;
  if (delivery.deleted_at) return false;
  const status = delivery.status;
  if (status === "draft") {
    if (isSuperAdmin(user) || isCeo(user) || isDirector(user)) return true;
    const team = (user.team_name ?? "").trim();
    if (isTeamLeader(user) && team && delivery.team_name === team) return true;
    return delivery.owner_id === (user.id ?? "");
  }
  if (status === "pending_leader") {
    if (isSuperAdmin(user) || isCeo(user) || isDirector(user)) return true;
    const team = (user.team_name ?? "").trim();
    if (isTeamLeader(user) && team && delivery.team_name === team) return true;
    return false;
  }
  if (status === "pending_director") {
    return isSuperAdmin(user) || isCeo(user) || isDirector(user);
  }
  return isSuperAdmin(user);
}

export function canDeleteDelivery(user: SettlementUserLike | null | undefined, delivery: Delivery): boolean {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  const early = delivery.status === "draft" || delivery.status === "pending_leader" || delivery.status === "pending_director";
  if ((isCeo(user) || isDirector(user)) && early) return true;
  const team = (user.team_name ?? "").trim();
  if (isTeamLeader(user) && team && delivery.team_name === team && delivery.status === "draft") return true;
  return delivery.owner_id === (user.id ?? "") && delivery.status === "draft";
}

export function canSubmit(user: SettlementUserLike | null | undefined, delivery: Delivery): boolean {
  if (!user) return false;
  if (delivery.status !== "draft") return false;
  if (delivery.deleted_at) return false;
  if (isSuperAdmin(user) || isCeo(user) || isDirector(user)) return true;
  const team = (user.team_name ?? "").trim();
  if (isTeamLeader(user) && team && delivery.team_name === team) return true;
  return delivery.owner_id === (user.id ?? "");
}

export function canApproveAsLeader(user: SettlementUserLike | null | undefined, delivery: Delivery): boolean {
  if (!user) return false;
  if (delivery.status !== "pending_leader") return false;
  if (delivery.deleted_at) return false;
  if (isSuperAdmin(user) || isCeo(user) || isDirector(user)) return true;
  const team = (user.team_name ?? "").trim();
  if (isTeamLeader(user) && team && delivery.team_name === team) return true;
  return false;
}

export function canApproveAsDirector(user: SettlementUserLike | null | undefined, delivery: Delivery): boolean {
  if (!user) return false;
  if (delivery.status !== "pending_director") return false;
  if (delivery.deleted_at) return false;
  return isSuperAdmin(user) || isCeo(user) || isDirector(user);
}

export function canReject(user: SettlementUserLike | null | undefined, delivery: Delivery): boolean {
  if (delivery.status === "pending_leader") return canApproveAsLeader(user, delivery);
  if (delivery.status === "pending_director") return canApproveAsDirector(user, delivery);
  return false;
}

export function canReopen(user: SettlementUserLike | null | undefined, delivery: Delivery): boolean {
  if (!user) return false;
  if (delivery.deleted_at) return false;
  if (delivery.status === "finalized") return false;
  const reopenable: Array<Delivery["status"]> = ["approved_director", "modilca_submitted", "confirmed", "carried_over"];
  if (!reopenable.includes(delivery.status)) return false;
  return isSuperAdmin(user) || isCeo(user) || isDirector(user);
}

export function resolveSubmitStatus(owner: SettlementUserLike): Delivery["status"] {
  if (isSuperAdmin(owner)) return "approved_director";
  if (isCeo(owner)) return "approved_director";
  if (isDirector(owner)) return "approved_director";
  if (isTeamLeader(owner)) return "pending_director";
  return "pending_leader";
}
