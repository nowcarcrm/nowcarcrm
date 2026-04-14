import { applyNextContactSnapshotFromRecords } from "./leaseCrmLogic";
import type { Lead } from "./leaseCrmTypes";
import type { UserRole } from "./usersSupabase";
import {
  createLead as createLeadInDb,
  deleteLead as deleteLeadInDb,
  fetchLeads,
  seedLeadsIfEmpty,
  type UpdateLeadOptions,
  updateLead as updateLeadInDb,
} from "./leaseCrmSupabase";
import { ensureDefaultUsers } from "./usersSupabase";

export type LeadViewerScope = {
  role: UserRole;
  userId: string;
  visibleUserIds?: string[];
  /** @see LeadSupabaseScope.operationalFullAccess — 관리자 운영 화면 전용 */
  operationalFullAccess?: boolean;
};

/** staff 저장 시 리드 담당(manager·표시명)을 로그인 프로필로 고정(UI 조작·낙관적 상태와 서버 prepare 이중 방어). 상담기록 작성자는 추가 시점에만 본인으로 넣는다(기존 이력은 덮지 않음). */
export function applyStaffLeadClientLocks(
  lead: Lead,
  profile: { userId: string; name: string }
): Lead {
  return {
    ...lead,
    managerUserId: profile.userId,
    base: { ...lead.base, ownerStaff: profile.name },
  };
}

export async function loadLeadsFromStorage(scope?: LeadViewerScope): Promise<Lead[]> {
  try {
    const leads = await fetchLeads(scope);
    return leads;
  } catch (error) {
    const details =
      error instanceof Error
        ? { message: error.message, name: error.name }
        : { message: String(error) };
    console.error("[leaseCrmStorage] loadLeadsFromStorage failed", {
      scope,
      details,
      raw: error,
    });
    throw error;
  }
}

export async function ensureSeedLeads() {
  await ensureDefaultUsers();
  await seedLeadsIfEmpty();
}

export async function createLead(lead: Lead, scope?: LeadViewerScope) {
  return createLeadInDb(lead, scope);
}

export async function updateLead(lead: Lead, scope?: LeadViewerScope, options?: UpdateLeadOptions) {
  await updateLeadInDb(applyNextContactSnapshotFromRecords(lead), scope, options);
}

export async function deleteLeadById(leadId: string, scope?: LeadViewerScope) {
  await deleteLeadInDb(leadId, scope);
}

