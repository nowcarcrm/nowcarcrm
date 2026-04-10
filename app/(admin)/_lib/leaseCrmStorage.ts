import type { Lead } from "./leaseCrmTypes";
import type { UserRole } from "./usersSupabase";
import {
  createLead as createLeadInDb,
  deleteLead as deleteLeadInDb,
  fetchLeads,
  seedLeadsIfEmpty,
  updateLead as updateLeadInDb,
} from "./leaseCrmSupabase";
import { ensureDefaultUsers } from "./usersSupabase";

export type LeadViewerScope = {
  role: UserRole;
  userId: string;
};

export async function loadLeadsFromStorage(scope?: LeadViewerScope): Promise<Lead[]> {
  try {
    const leads = await fetchLeads(scope);
    return leads;
  } catch {
    return [];
  }
}

export async function ensureSeedLeads() {
  await ensureDefaultUsers();
  await seedLeadsIfEmpty();
}

export async function createLead(lead: Lead, scope?: LeadViewerScope) {
  return createLeadInDb(lead, scope);
}

export async function updateLead(lead: Lead, scope?: LeadViewerScope) {
  await updateLeadInDb(lead, scope);
}

export async function deleteLeadById(leadId: string, scope?: LeadViewerScope) {
  await deleteLeadInDb(leadId, scope);
}

