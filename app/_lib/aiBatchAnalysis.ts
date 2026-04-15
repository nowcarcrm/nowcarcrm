import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";
import { emitToUserRoom } from "@/app/_lib/socketGateway";
import { REALTIME_EVENTS } from "@/app/_lib/realtimeEvents";

export type AiTemperature = "HOT" | "WARM" | "COLD" | "DEAD";
export type AiUrgency = "긴급" | "보통" | "여유";

type LeadRow = {
  id: string | number;
  manager_user_id: string | null;
  name: string | null;
  car_model: string | null;
  source: string | null;
  status: string | null;
  next_contact_at: string | null;
  created_at: string;
};

type ConsultationRow = {
  lead_id: string | number;
  memo: string | null;
  created_at: string;
  next_action_at: string | null;
};

type QuoteRow = {
  lead_id: string | number;
  created_at: string | null;
};

type AnalysisDraft = {
  employee_id: string;
  lead_id: string;
  analysis_date: string;
  temperature: AiTemperature;
  urgency: AiUrgency;
  priority_score: number;
  next_action: string;
  pre_generated_ment: Record<string, unknown> | null;
};

type LeadSnapshot = {
  leadId: string;
  employeeId: string;
  customerName: string;
  carModel: string;
  source: string;
  status: string;
  createdAt: string;
  nextContactAt: string | null;
  consultCount: number;
  lastConsultAt: string | null;
  lastConsultMemo: string;
  lastQuoteAt: string | null;
};

function hoursSince(iso: string | null): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return (Date.now() - t) / 3_600_000;
}

function daysSince(iso: string | null): number {
  return hoursSince(iso) / 24;
}

function hasSpecificConditionText(text: string): boolean {
  const q = text.toLowerCase();
  return ["하이브리드", "리스", "렌트", "선납", "보증금", "월 납입", "차종", "트림", "옵션"].some((k) =>
    q.includes(k.toLowerCase())
  );
}

function hasQuoteRequestText(text: string): boolean {
  const q = text.toLowerCase();
  return ["견적", "비교표", "조건표", "금융사", "계약"].some((k) => q.includes(k.toLowerCase()));
}

function isInboundQuestion(text: string): boolean {
  const q = text.toLowerCase();
  return ["문의", "가능", "되나요", "얼마", "조건", "?"].some((k) => q.includes(k.toLowerCase()));
}

function scoreToTemperature(snapshot: LeadSnapshot): AiTemperature {
  const lastDays = daysSince(snapshot.lastConsultAt);
  const memo = snapshot.lastConsultMemo;
  if (lastDays <= 3 && hasSpecificConditionText(memo) && hasQuoteRequestText(memo)) return "HOT";
  if (lastDays <= 7 && (hasSpecificConditionText(memo) || hasQuoteRequestText(memo))) return "WARM";
  if (lastDays > 30) return "DEAD";
  return "COLD";
}

function scoreToUrgency(snapshot: LeadSnapshot, temperature: AiTemperature): AiUrgency {
  const sinceLastConsult = daysSince(snapshot.lastConsultAt);
  const sinceCreatedHours = hoursSince(snapshot.createdAt);
  const memo = snapshot.lastConsultMemo;
  const isNewUnattended = snapshot.status === "신규" && snapshot.consultCount === 0 && sinceCreatedHours >= 0.5;
  if (isNewUnattended) return "긴급";
  if (isInboundQuestion(memo) && hoursSince(snapshot.lastConsultAt) >= 3) return "긴급";
  if (temperature === "HOT" && sinceLastConsult >= 2) return "긴급";
  if ((snapshot.nextContactAt && daysSince(snapshot.nextContactAt) >= 0) || daysSince(snapshot.lastQuoteAt) >= 2) {
    return "보통";
  }
  return "여유";
}

function nextActionFor(snapshot: LeadSnapshot, temperature: AiTemperature, urgency: AiUrgency): string {
  if (snapshot.status === "신규" && snapshot.consultCount === 0) return "첫 인사 필요";
  if (urgency === "긴급" && temperature === "HOT") return "클로징 시도";
  if (daysSince(snapshot.lastQuoteAt) >= 2) return "견적 확인";
  if (daysSince(snapshot.lastConsultAt) >= 7) return "재컨택";
  return "팔로업 전화";
}

function priorityScoreFor(snapshot: LeadSnapshot, temperature: AiTemperature, urgency: AiUrgency): number {
  let score = 10;
  score += temperature === "HOT" ? 45 : temperature === "WARM" ? 28 : temperature === "COLD" ? 15 : 0;
  score += urgency === "긴급" ? 35 : urgency === "보통" ? 18 : 8;
  if (snapshot.status === "신규" && snapshot.consultCount === 0) score += 12;
  if (daysSince(snapshot.lastConsultAt) >= 7) score += 8;
  if (daysSince(snapshot.lastConsultAt) >= 30) score -= 12;
  return Math.max(0, Math.min(100, score));
}

async function generatePreMent(snapshot: LeadSnapshot, nextAction: string, priorityScore: number) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  const prompt = [
    "한국어로 짧고 실무적인 고객 연락 멘트 1개를 작성해줘.",
    "JSON만 반환: {\"message\":\"...\",\"rationale\":\"...\"}",
    `고객명: ${snapshot.customerName}`,
    `관심차종: ${snapshot.carModel}`,
    `유입: ${snapshot.source}`,
    `현재상태: ${snapshot.status}`,
    `추천액션: ${nextAction}`,
    `우선순위: ${priorityScore}`,
  ].join("\n");
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.4,
        max_tokens: 280,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "너는 자동차 리스/렌트 영업 코치다." },
          { role: "user", content: prompt },
        ],
      }),
    });
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!raw) return null;
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function loadEmployeeSnapshots(targetEmployeeId?: string): Promise<LeadSnapshot[]> {
  let leadQuery = supabaseAdmin
    .from("leads")
    .select("id, manager_user_id, name, car_model, source, status, next_contact_at, created_at")
    .not("manager_user_id", "is", null);
  if (targetEmployeeId) leadQuery = leadQuery.eq("manager_user_id", targetEmployeeId);
  const { data: leads, error: leadErr } = await leadQuery;
  if (leadErr) throw new Error(`리드 조회 실패: ${leadErr.message}`);
  const rows = (leads ?? []) as LeadRow[];
  if (rows.length === 0) return [];
  const leadIds = rows.map((l) => String(l.id));
  const [consultRes, quoteRes] = await Promise.all([
    supabaseAdmin
      .from("consultations")
      .select("lead_id,memo,created_at,next_action_at")
      .in("lead_id", leadIds)
      .order("created_at", { ascending: false }),
    supabaseAdmin.from("contracts").select("lead_id,created_at").in("lead_id", leadIds),
  ]);
  if (consultRes.error) throw new Error(`상담 조회 실패: ${consultRes.error.message}`);
  if (quoteRes.error) throw new Error(`계약 조회 실패: ${quoteRes.error.message}`);
  const consultByLead = new Map<string, ConsultationRow[]>();
  for (const row of (consultRes.data ?? []) as ConsultationRow[]) {
    const leadId = String(row.lead_id);
    const list = consultByLead.get(leadId) ?? [];
    list.push(row);
    consultByLead.set(leadId, list);
  }
  const quoteByLead = new Map<string, QuoteRow[]>();
  for (const row of (quoteRes.data ?? []) as QuoteRow[]) {
    const leadId = String(row.lead_id);
    const list = quoteByLead.get(leadId) ?? [];
    list.push(row);
    quoteByLead.set(leadId, list);
  }
  return rows.map((lead) => {
    const leadId = String(lead.id);
    const consults = (consultByLead.get(leadId) ?? []).filter(
      (c) => !(c.memo ?? "").startsWith("CRM_EXTRA:v1:")
    );
    const last = consults[0] ?? null;
    const quotes = quoteByLead.get(leadId) ?? [];
    const lastQuoteAt = quotes
      .map((q) => q.created_at)
      .filter((d): d is string => !!d)
      .sort((a, b) => (a < b ? 1 : -1))[0] ?? null;
    return {
      leadId,
      employeeId: String(lead.manager_user_id),
      customerName: String(lead.name ?? "고객"),
      carModel: String(lead.car_model ?? ""),
      source: String(lead.source ?? ""),
      status: String(lead.status ?? "신규"),
      createdAt: lead.created_at,
      nextContactAt: lead.next_contact_at,
      consultCount: consults.length,
      lastConsultAt: last?.created_at ?? null,
      lastConsultMemo: String(last?.memo ?? ""),
      lastQuoteAt,
    };
  });
}

export async function runDailyAiBatch(params?: { employeeId?: string; forceDate?: string }) {
  const analysisDate = (params?.forceDate ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
  const snapshots = await loadEmployeeSnapshots(params?.employeeId);
  if (snapshots.length === 0) return { analysisDate, analyzed: 0, employees: 0 };

  const drafts = snapshots.map((s) => {
    const temperature = scoreToTemperature(s);
    const urgency = scoreToUrgency(s, temperature);
    const next_action = nextActionFor(s, temperature, urgency);
    const priority_score = priorityScoreFor(s, temperature, urgency);
    return {
      employee_id: s.employeeId,
      lead_id: s.leadId,
      analysis_date: analysisDate,
      temperature,
      urgency,
      priority_score,
      next_action,
      pre_generated_ment: null,
    } satisfies AnalysisDraft;
  });

  const sortedByEmployee = new Map<string, AnalysisDraft[]>();
  for (const d of drafts) {
    const arr = sortedByEmployee.get(d.employee_id) ?? [];
    arr.push(d);
    sortedByEmployee.set(d.employee_id, arr);
  }
  const preGenTargets = new Set<string>();
  for (const [, arr] of sortedByEmployee) {
    arr.sort((a, b) => b.priority_score - a.priority_score);
    for (const top of arr.slice(0, 10)) preGenTargets.add(`${top.employee_id}:${top.lead_id}`);
  }

  for (const d of drafts) {
    if (!preGenTargets.has(`${d.employee_id}:${d.lead_id}`)) continue;
    const snapshot = snapshots.find((s) => s.employeeId === d.employee_id && s.leadId === d.lead_id);
    if (!snapshot) continue;
    d.pre_generated_ment = await generatePreMent(snapshot, d.next_action, d.priority_score);
  }

  const { error } = await supabaseAdmin.from("daily_ai_analyses").upsert(drafts, {
    onConflict: "employee_id,lead_id,analysis_date",
  });
  if (error) throw new Error(`분석 저장 실패: ${error.message}`);
  return {
    analysisDate,
    analyzed: drafts.length,
    employees: sortedByEmployee.size,
  };
}

export async function fetchDailyQueueForUser(employeeId: string, date?: string) {
  const analysisDate = (date ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
  const { data, error } = await supabaseAdmin
    .from("daily_ai_analyses")
    .select("id,lead_id,temperature,urgency,priority_score,next_action,pre_generated_ment,analysis_date")
    .eq("employee_id", employeeId)
    .eq("analysis_date", analysisDate)
    .order("priority_score", { ascending: false });
  if (error) throw new Error(`일일 큐 조회 실패: ${error.message}`);
  const rows =
    (data as Array<{
      id: string;
      lead_id: string;
      temperature: AiTemperature;
      urgency: AiUrgency;
      priority_score: number;
      next_action: string;
      pre_generated_ment: Record<string, unknown> | null;
    }> | null) ?? [];
  const leadIds = rows.map((r) => r.lead_id);
  const { data: leads } = await supabaseAdmin
    .from("leads")
    .select("id,name,car_model,source,next_contact_at,created_at,status")
    .in("id", leadIds);
  const leadMap = new Map<string, Record<string, unknown>>();
  for (const lead of leads ?? []) {
    leadMap.set(String((lead as { id: string }).id), lead as Record<string, unknown>);
  }
  const queue = rows.map((row, index) => {
    const lead = leadMap.get(row.lead_id) ?? {};
    return {
      rank: index + 1,
      leadId: row.lead_id,
      customerName: String(lead.name ?? "고객"),
      carModel: String(lead.car_model ?? ""),
      source: String(lead.source ?? ""),
      lastContactAt: String(lead.next_contact_at ?? lead.created_at ?? ""),
      status: String(lead.status ?? ""),
      temperature: row.temperature,
      urgency: row.urgency,
      priorityScore: row.priority_score,
      nextAction: row.next_action,
      preGeneratedMent: row.pre_generated_ment,
    };
  });
  const summary = {
    total: queue.length,
    hotCount: queue.filter((q) => q.temperature === "HOT").length,
    urgentCount: queue.filter((q) => q.urgency === "긴급").length,
    followUpCount: queue.filter((q) => q.nextAction.includes("팔로업") || q.nextAction.includes("견적")).length,
  };
  const insight =
    summary.hotCount >= 3
      ? "HOT 고객 비중이 높습니다. 오전에 HOT 우선 연락으로 전환율을 끌어올리세요."
      : summary.urgentCount >= 3
        ? "긴급 알림 대상이 많습니다. 신규/미응답 고객부터 빠르게 정리하세요."
        : "오늘은 보통 우선순위 고객 중심으로 안정적인 팔로업을 권장합니다.";
  return { analysisDate, queue, summary, insight };
}

export async function detectAiAlerts() {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabaseAdmin
    .from("daily_ai_analyses")
    .select("employee_id,lead_id,temperature,urgency,next_action,priority_score")
    .eq("analysis_date", today);
  if (error) throw new Error(`알림 비교 데이터 조회 실패: ${error.message}`);
  const rows =
    (data as Array<{
      employee_id: string;
      lead_id: string;
      temperature: AiTemperature;
      urgency: AiUrgency;
      next_action: string;
      priority_score: number;
    }> | null) ?? [];
  for (const row of rows) {
    if (row.urgency !== "긴급") continue;
    const title = "⚠️ AI 긴급 알림";
    const message = `고객 ${row.lead_id}는 ${row.temperature}/${row.urgency} 상태입니다. ${row.next_action} 권장`;
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("notifications")
      .insert({
        user_id: row.employee_id,
        type: "ai-alert",
        title,
        message,
        data: {
          leadId: row.lead_id,
          temperature: row.temperature,
          urgency: row.urgency,
          nextAction: row.next_action,
          priorityScore: row.priority_score,
        },
      })
      .select("id,user_id,type,title,message,data,is_read,created_at")
      .single();
    if (!insertErr && inserted) {
      emitToUserRoom(row.employee_id, REALTIME_EVENTS.NOTIFICATION, inserted);
      emitToUserRoom(row.employee_id, REALTIME_EVENTS.AI_ALERT, inserted);
    }
  }
}
