import {
  isToday,
  lastContactReferenceIso,
  operationalStageKeyForLead,
  operationalStageLabelForLead,
} from "./leaseCrmLogic";
import type { Lead } from "./leaseCrmTypes";
import type { UserRow, UserRole } from "./usersSupabase";
import { positionLabelKo, roleLabelKo } from "./usersSupabase";

/** 목록·엑셀·운영 화면 공통: 파이프라인 stage 한글 (computeCategory 기준 1버킷) */
export function pipelineStageLabelForLead(lead: Lead): string {
  return operationalStageLabelForLead(lead);
}

export function lifecycleStatusLabel(lead: Lead): string {
  if (lead.counselingStatus === "보류") return "보류";
  if (lead.counselingStatus === "취소") return "취소";
  return "진행중";
}

export type StaffOverviewRow = {
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  roleLabel: string;
  positionLabel: string;
  assignedTotal: number;
  registeredThisMonth: number;
  registeredToday: number;
  countNew: number;
  countCounseling: number;
  countAbsent: number;
  countContract: number;
  countExport: number;
  countDelivered: number;
  countHold: number;
  countCancel: number;
  feeThisMonthWon: number;
  lastConsultAt: string | null;
  todayNextContactCount: number;
};

export type StaffOverviewOrgSummary = {
  staffCount: number;
  totalLeads: number;
  registeredToday: number;
  registeredThisMonth: number;
  feeThisMonthWon: number;
  todayNextContactTotal: number;
};

function monthKeyPrefix(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function isSameMonthPrefix(iso: string, prefix: string): boolean {
  const head = String(iso ?? "").slice(0, 7);
  return head === prefix;
}

function isSameDayPrefix(iso: string, ymd: string): boolean {
  return String(iso ?? "").slice(0, 10) === ymd;
}

function maxIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

function bumpStageCount(
  row: Pick<
    StaffOverviewRow,
    | "countNew"
    | "countCounseling"
    | "countAbsent"
    | "countContract"
    | "countExport"
    | "countDelivered"
    | "countHold"
    | "countCancel"
  >,
  stage: ReturnType<typeof operationalStageKeyForLead>
) {
  switch (stage) {
    case "new":
      row.countNew += 1;
      break;
    case "active":
      row.countCounseling += 1;
      break;
    case "missed":
      row.countAbsent += 1;
      break;
    case "contract":
      row.countContract += 1;
      break;
    case "delivery":
      row.countExport += 1;
      break;
    case "delivered":
      row.countDelivered += 1;
      break;
    case "hold":
      row.countHold += 1;
      break;
    case "cancel":
      row.countCancel += 1;
      break;
    default:
      break;
  }
}

function emptyStaffCounts(): Pick<
  StaffOverviewRow,
  | "countNew"
  | "countCounseling"
  | "countAbsent"
  | "countContract"
  | "countExport"
  | "countDelivered"
  | "countHold"
  | "countCancel"
  | "registeredThisMonth"
  | "registeredToday"
  | "feeThisMonthWon"
  | "todayNextContactCount"
  | "lastConsultAt"
> {
  return {
    countNew: 0,
    countCounseling: 0,
    countAbsent: 0,
    countContract: 0,
    countExport: 0,
    countDelivered: 0,
    countHold: 0,
    countCancel: 0,
    registeredThisMonth: 0,
    registeredToday: 0,
    feeThisMonthWon: 0,
    todayNextContactCount: 0,
    lastConsultAt: null,
  };
}

/** manager_user_id 기준. stage는 `operationalStageKeyForLead` 단일 버킷. */
export function buildStaffOverviewRows(
  leads: Lead[],
  users: UserRow[],
  contractByLeadId: Map<string, { feeWon: number; contractDate: string }>,
  lastConsultByLeadId: Map<string, string>
): StaffOverviewRow[] {
  const now = new Date();
  const monthPrefix = monthKeyPrefix(now);
  const todayYmd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const byUser = new Map<string, Lead[]>();
  for (const l of leads) {
    const uid = (l.managerUserId ?? "").trim();
    if (!uid) continue;
    if (!byUser.has(uid)) byUser.set(uid, []);
    byUser.get(uid)!.push(l);
  }

  const rows: StaffOverviewRow[] = [];

  for (const u of users) {
    const userId = u.id;
    const list = byUser.get(userId) ?? [];
    const name = u.name?.trim() || list[0]?.base.ownerStaff?.trim() || userId.slice(0, 8);
    const cts = emptyStaffCounts();

    for (const l of list) {
      if (isSameMonthPrefix(l.createdAt, monthPrefix)) cts.registeredThisMonth += 1;
      if (isSameDayPrefix(l.createdAt, todayYmd)) cts.registeredToday += 1;

      bumpStageCount(cts, operationalStageKeyForLead(l));

      const c = contractByLeadId.get(l.id);
      if (c && c.contractDate && c.contractDate.startsWith(monthPrefix)) {
        cts.feeThisMonthWon += c.feeWon;
      }

      const fromConsult = lastConsultByLeadId.get(l.id) ?? null;
      const fromLead = lastContactReferenceIso(l);
      cts.lastConsultAt = maxIso(cts.lastConsultAt, maxIso(fromConsult, fromLead));

      if (l.nextContactAt && isToday(l.nextContactAt)) cts.todayNextContactCount += 1;
    }

    rows.push({
      userId,
      name,
      email: (u.email ?? "").trim(),
      role: u.role,
      roleLabel: roleLabelKo(u.role),
      positionLabel: positionLabelKo(u),
      assignedTotal: list.length,
      ...cts,
    });
  }

  const listed = new Set(users.map((x) => x.id));
  for (const [orphanId, list] of byUser) {
    if (listed.has(orphanId)) continue;
    const name = list[0]?.base.ownerStaff?.trim() || `미매칭(${orphanId.slice(0, 8)})`;
    const cts = emptyStaffCounts();
    for (const l of list) {
      if (isSameMonthPrefix(l.createdAt, monthPrefix)) cts.registeredThisMonth += 1;
      if (isSameDayPrefix(l.createdAt, todayYmd)) cts.registeredToday += 1;
      bumpStageCount(cts, operationalStageKeyForLead(l));
      const c = contractByLeadId.get(l.id);
      if (c && c.contractDate && c.contractDate.startsWith(monthPrefix)) {
        cts.feeThisMonthWon += c.feeWon;
      }
      const fromConsult = lastConsultByLeadId.get(l.id) ?? null;
      const fromLead = lastContactReferenceIso(l);
      cts.lastConsultAt = maxIso(cts.lastConsultAt, maxIso(fromConsult, fromLead));
      if (l.nextContactAt && isToday(l.nextContactAt)) cts.todayNextContactCount += 1;
    }
    rows.push({
      userId: orphanId,
      name,
      email: "",
      role: "staff",
      roleLabel: roleLabelKo("staff"),
      positionLabel: "직급 미설정",
      assignedTotal: list.length,
      ...cts,
    });
  }

  rows.sort((a, b) => a.name.localeCompare(b.name, "ko"));
  return rows;
}

/** 조직 전체 요약: 활성 직원 수 + 전체 리드 기준 등록·연락·이번달 수수료 */
export function buildOrgSummary(
  activeUserCount: number,
  allLeads: Lead[],
  contractByLeadId: Map<string, { feeWon: number; contractDate: string }>
): StaffOverviewOrgSummary {
  const now = new Date();
  const monthPrefix = monthKeyPrefix(now);
  const todayYmd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  let registeredToday = 0;
  let registeredThisMonth = 0;
  let feeThisMonthWon = 0;
  let todayNextContactTotal = 0;

  for (const l of allLeads) {
    if (isSameMonthPrefix(l.createdAt, monthPrefix)) registeredThisMonth += 1;
    if (isSameDayPrefix(l.createdAt, todayYmd)) registeredToday += 1;
    if (l.nextContactAt && isToday(l.nextContactAt)) todayNextContactTotal += 1;
    const c = contractByLeadId.get(l.id);
    if (c && c.contractDate && c.contractDate.startsWith(monthPrefix)) {
      feeThisMonthWon += c.feeWon;
    }
  }

  return {
    staffCount: activeUserCount,
    totalLeads: allLeads.length,
    registeredToday,
    registeredThisMonth,
    feeThisMonthWon,
    todayNextContactTotal,
  };
}

export function truncateMemo(memo: string | null | undefined, max = 80): string {
  const s = (memo ?? "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}
