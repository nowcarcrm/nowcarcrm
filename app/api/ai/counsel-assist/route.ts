import { NextResponse } from "next/server";
import { z } from "zod";
import {
  COUNSEL_ASSIST_CHANNEL_OPTIONS,
  COUNSEL_ASSIST_MESSAGE_TONES,
  COUNSEL_ASSIST_OBJECTION_OPTIONS,
  COUNSEL_ASSIST_PURPOSES,
  COUNSEL_ASSIST_UI_TONES,
  type CounselAssistContextPayload,
  type CounselAssistManualInput,
  type CounselAssistRequestOptions,
  type CounselAssistResult,
} from "@/app/(admin)/_lib/counselAssistShared";
import { saveAiCounselAnalysisDraft } from "@/app/(admin)/_lib/aiCounselAnalysisService";
import { getDataAccessScopeByRank, normalizeUserTeam } from "@/app/(admin)/_lib/rolePermissions";
import { supabaseAdmin, supabaseAuthVerifier } from "@/app/_lib/supabaseAdminServer";

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

async function getRequester(authUserId: string) {
  const { data: byId, error: e1 } = await supabaseAdmin
    .from("users")
    .select("id, role, rank, team_name, approval_status")
    .eq("id", authUserId)
    .maybeSingle();
  if (e1) return { row: null, error: e1 };
  if (byId) return { row: byId, error: null };
  const { data: legacy, error: e2 } = await supabaseAdmin
    .from("users")
    .select("id, role, rank, team_name, approval_status")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  return { row: legacy, error: e2 };
}

const toneEnum = COUNSEL_ASSIST_MESSAGE_TONES as unknown as [string, ...string[]];
const uiToneEnum = COUNSEL_ASSIST_UI_TONES as unknown as [string, ...string[]];
const purposeEnum = COUNSEL_ASSIST_PURPOSES as unknown as [string, ...string[]];
const channelEnum = COUNSEL_ASSIST_CHANNEL_OPTIONS as unknown as [string, ...string[]];
const objectionEnum = COUNSEL_ASSIST_OBJECTION_OPTIONS as unknown as [string, ...string[]];

const ContextSchema = z.object({
  leadId: z.string().min(1),
  managerUserId: z.string().nullable().optional(),
  base: z.object({
    name: z.string(),
    phone: z.string(),
    desiredVehicle: z.string(),
    source: z.string(),
    leadTemperature: z.string(),
    customerType: z.string(),
    contractTerm: z.string(),
    wantedMonthlyPayment: z.number(),
    depositOrPrepaymentAmount: z.string(),
    memo: z.string(),
    ownerStaff: z.string(),
  }),
  status: z.object({
    counselingStatus: z.string(),
    leadPriority: z.string(),
    creditReviewStatus: z.string(),
    failureReason: z.string(),
    failureReasonNote: z.string(),
  }),
  timeline: z.object({
    createdAt: z.string(),
    lastHandledAt: z.string(),
    nextContactAt: z.string().nullable(),
    nextContactMemo: z.string(),
    statusUpdatedAt: z.string(),
  }),
  counselingRecords: z.array(
    z.object({
      occurredAt: z.string(),
      method: z.string(),
      counselor: z.string(),
      content: z.string(),
      reaction: z.string(),
      desiredProgressAt: z.string(),
      nextContactAt: z.string(),
      nextContactMemo: z.string(),
      importance: z.string(),
    })
  ),
  quoteHistory: z.array(
    z.object({
      quotedAt: z.string(),
      productType: z.string(),
      financeCompany: z.string(),
      vehicleModel: z.string(),
      contractTerm: z.string(),
      monthlyPayment: z.number(),
      depositAmount: z.number(),
      prepaymentAmount: z.number(),
      maintenanceIncluded: z.boolean(),
      note: z.string(),
    })
  ),
  contract: z
    .object({
      contractDate: z.string(),
      product: z.string(),
      vehicleName: z.string(),
      vehiclePrice: z.number(),
      monthlyPayment: z.number(),
      contractTerm: z.string(),
      depositAmount: z.number(),
      pickupPlannedAt: z.string(),
      note: z.string(),
    })
    .nullable(),
  exportProgress: z
    .object({
      stage: z.string(),
      expectedDeliveryDate: z.string().optional(),
      vehicleModel: z.string().optional(),
      financeCompany: z.string().optional(),
      deliveredAt: z.string().nullable().optional(),
    })
    .nullable(),
});

const ManualInputSchema = z.object({
  reactionSummary: z.string().max(500),
  objections: z.array(z.enum(objectionEnum)).max(10),
  objectionsFreeText: z.string().max(500),
  budgetSensitive: z.boolean(),
  desiredVehicle: z.string().max(200),
  alternativeVehicle: z.string().max(200),
  upfrontBudgetRange: z.string().max(120),
  urgency: z.enum(["급함", "보통", "낮음"]),
  recentChannel: z.enum(channelEnum),
  lastCustomerReaction: z.string().max(300),
});

const RequestSchema = z.object({
  context: ContextSchema,
  options: z.object({
    uiTone: z.enum(uiToneEnum),
    purpose: z.enum(purposeEnum),
  }),
  manualInput: ManualInputSchema,
});

const CounselAssistResultSchema = z.object({
  summary: z.array(z.string()).min(3).max(5),
  customerStage: z.string().min(1),
  purchaseIntentScore: z.number().int().min(0).max(100),
  priceSensitivityScore: z.number().int().min(0).max(100),
  responseRiskScore: z.number().int().min(0).max(100),
  riskSignals: z.array(z.string()).min(1).max(12),
  recommendedAction: z.string().min(1),
  recommendedActions: z.array(z.string()).min(2).max(5),
  messageSuggestions: z
    .array(
      z.object({
        tone: z.enum(toneEnum),
        text: z.string().min(1),
      })
    )
    .length(3),
  oneLineReply: z.string().min(1).max(180),
  nextQuestions: z.array(z.string().min(1)).length(2),
  talkPoints: z.array(z.string().min(1)).min(3).max(6),
  cautionPhrases: z.array(z.string().min(1)).min(2).max(4),
  conversionLikelihoodNote: z.string().min(1),
  pushOrPauseAdvice: z.string().min(1),
});

function developerPrompt(options: CounselAssistRequestOptions): string {
  const toneRule: Record<(typeof COUNSEL_ASSIST_UI_TONES)[number], string> = {
    친절형: "친절형: 공감 중심, 부드러운 설명형, 압박 금지",
    설득형: "설득형: 비교 우위와 정리 중심, 이유를 짧게 제시",
    단호형: "단호형: 불필요한 장문 없이 핵심만 명확히",
    대표형: "대표형: 확신은 있으나 부담스럽지 않게, 책임감 있는 톤",
  };

  return [
    "You are a Korean automotive lease/rent sales coach for real frontline reps.",
    "User is a real sales rep and wants copy-ready Korean follow-up phrases for Kakao/SMS/calls.",
    "Apply selected style and purpose strictly.",
    `Selected user tone: ${options.uiTone} / Rule: ${toneRule[options.uiTone]}`,
    `Selected purpose: ${options.purpose}`,
    "Avoid pressure and lower customer resistance first.",
    "Never promise underwriting approval, delivery guarantee, fake discounts, or certainty without facts.",
    "If information is insufficient, avoid hard claims and say uncertainty briefly.",
    "Keep sentences short, practical, and conversational. No robotic phrasing.",
    "Output JSON only (no markdown, no extra text).",
  ].join("\n");
}

function fallbackResult(): CounselAssistResult {
  return {
    summary: [
      "상담 데이터가 충분하지 않아 보수적으로 요약했습니다.",
      "고객의 예산·초기비용 부담과 차종 우선순위를 먼저 다시 확인하는 것이 좋습니다.",
      "압박보다 공감 중심 재접촉이 전환 가능성을 높입니다.",
    ],
    customerStage: "정보 재확인 단계",
    purchaseIntentScore: 52,
    priceSensitivityScore: 58,
    responseRiskScore: 53,
    riskSignals: ["정보 부족", "조건 재확인 필요"],
    recommendedAction: "오늘 안에 부담을 낮춘 조건으로 짧게 재컨택하세요.",
    recommendedActions: [
      "월 납입/초기비용 기준을 먼저 1문장으로 확인",
      "관심 차종 + 대체 차종 1개씩만 제시",
      "다음 연락 시간을 고객이 선택하게 유도",
    ],
    messageSuggestions: [
      {
        tone: "부담 완화형",
        text: "고객님, 말씀 주신 예산 범위에서 부담이 덜한 조건으로 다시 정리해봤습니다. 괜찮으시면 1~2가지 안만 짧게 비교해서 안내드릴게요.",
      },
      {
        tone: "신뢰 확보형",
        text: "확정되지 않은 부분은 확정처럼 말씀드리지 않고, 가능한 조건 기준으로만 정확히 안내드리겠습니다. 비교하실 수 있게 핵심만 정리해 드릴게요.",
      },
      {
        tone: "마감 유도형",
        text: "오늘 확인 가능하시면 현재 조건 기준으로 가장 유리한 안부터 먼저 잡아보겠습니다. 원하시는 시간 알려주시면 바로 맞춰드릴게요.",
      },
    ],
    oneLineReply: "부담 덜한 조건으로 핵심만 다시 정리해드릴까요?",
    nextQuestions: ["월 납입 한도는 최대 어느 정도까지 생각하고 계실까요?", "초기비용은 어느 범위에서 진행 가능하실까요?"],
    talkPoints: ["가격 부담 완화", "조건 투명성", "다음 일정 확정"],
    cautionPhrases: ["무조건 승인됩니다", "최저가 보장", "곧 무조건 출고됩니다"],
    conversionLikelihoodNote: "조건 재정리 후 재접촉 시 전환 가능성이 중간 이상으로 회복될 수 있습니다.",
    pushOrPauseAdvice: "지금은 강한 압박보다 짧은 재확인 메시지로 접근하세요.",
  };
}

function parseModelJson(raw: string): CounselAssistResult {
  try {
    return CounselAssistResultSchema.parse(JSON.parse(raw)) as CounselAssistResult;
  } catch (e) {
    console.error("[counsel-assist] parse/validate failed", e);
    return fallbackResult();
  }
}

function buildUserPrompt(
  context: CounselAssistContextPayload,
  options: CounselAssistRequestOptions,
  manualInput: CounselAssistManualInput
): string {
  const compactManual = {
    ...manualInput,
    selectedTone: options.uiTone,
    selectedPurpose: options.purpose,
  };

  return [
    "Analyze the lead and produce practical sales guidance.",
    "Lead snapshot JSON:",
    JSON.stringify(context, null, 2),
    "Rep override inputs JSON:",
    JSON.stringify(compactManual, null, 2),
  ].join("\n\n");
}

async function assertLeadAccess(params: {
  leadId: string;
  requesterId: string;
  role: string;
  rank: string | null;
  teamName: string | null;
}) {
  const { data: leadRow, error: leadErr } = await supabaseAdmin
    .from("leads")
    .select("id, manager_user_id")
    .eq("id", params.leadId)
    .maybeSingle();

  if (leadErr) {
    console.error("[counsel-assist] lead lookup", leadErr);
    return { ok: false, status: 500 as const, error: "고객 조회에 실패했습니다." };
  }
  if (!leadRow) {
    return { ok: false, status: 404 as const, error: "고객을 찾을 수 없습니다." };
  }

  const managerId = (leadRow as { manager_user_id?: string | null }).manager_user_id ?? null;

  if (params.role === "staff") {
    if (!managerId) {
      return {
        ok: false,
        status: 403 as const,
        error: "미배정 리드는 staff 권한으로 AI 분석할 수 없습니다.",
      };
    }
    if (managerId !== params.requesterId) {
      return {
        ok: false,
        status: 403 as const,
        error: "본인 담당 리드만 AI 분석할 수 있습니다.",
      };
    }
    return { ok: true, status: 200 as const, managerId };
  }

  const accessScope = getDataAccessScopeByRank({
    rank: params.rank,
    team_name: params.teamName,
    role: params.role,
  });
  if (accessScope === "all") {
    return { ok: true, status: 200 as const, managerId };
  }

  if (!managerId) {
    if (accessScope === "team") {
      return {
        ok: false,
        status: 403 as const,
        error: "팀장 권한에서는 미배정 리드를 AI 분석할 수 없습니다.",
      };
    }
    return { ok: true, status: 200 as const, managerId };
  }

  const { data: ownerRow, error: ownerErr } = await supabaseAdmin
    .from("users")
    .select("id, rank, team_name")
    .eq("id", managerId)
    .maybeSingle();
  if (ownerErr) {
    console.error("[counsel-assist] owner lookup", ownerErr);
    return { ok: false, status: 500 as const, error: "담당자 정보 조회에 실패했습니다." };
  }

  if (accessScope === "all_except_executive") {
    const ownerRank = (ownerRow?.rank ?? "").trim();
    if (ownerRank === "대표" || ownerRank === "총괄대표") {
      return {
        ok: false,
        status: 403 as const,
        error: "본부장 권한에서는 대표/총괄대표 담당 리드 분석이 제한됩니다.",
      };
    }
    return { ok: true, status: 200 as const, managerId };
  }

  if (accessScope === "team") {
    const viewerTeam = normalizeUserTeam(params.teamName);
    const ownerTeam = normalizeUserTeam(ownerRow?.team_name ?? null);
    if (!viewerTeam || !ownerTeam || viewerTeam !== ownerTeam) {
      return {
        ok: false,
        status: 403 as const,
        error: "팀장 권한에서는 같은 팀 리드만 AI 분석할 수 있습니다.",
      };
    }
    return { ok: true, status: 200 as const, managerId };
  }

  return { ok: true, status: 200 as const, managerId };
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "인증 토큰이 없습니다." }, { status: 401 });

    const { data: authData, error: authErr } = await supabaseAuthVerifier.auth.getUser(token);
    if (authErr || !authData.user) {
      return NextResponse.json({ error: "유효하지 않은 인증입니다." }, { status: 401 });
    }

    const { row: requester, error: requesterErr } = await getRequester(authData.user.id);
    if (requesterErr || !requester) {
      return NextResponse.json({ error: "직원 계정 확인에 실패했습니다." }, { status: 403 });
    }

    const role = (requester.role ?? "") as string;
    const rank = (requester.rank ?? null) as string | null;
    const teamName = (requester.team_name ?? null) as string | null;
    const approved = requester.approval_status === "approved";
    if (!approved || !["staff", "admin", "super_admin"].includes(role)) {
      return NextResponse.json({ error: "AI 상담 어시스트 접근 권한이 없습니다." }, { status: 403 });
    }

    const parsed = RequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
    }

    const { context, options, manualInput } = parsed.data as {
      context: CounselAssistContextPayload;
      options: CounselAssistRequestOptions;
      manualInput: CounselAssistManualInput;
    };

    const access = await assertLeadAccess({
      leadId: context.leadId,
      requesterId: requester.id,
      role,
      rank,
      teamName,
    });
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "OPENAI_API_KEY가 설정되지 않았습니다.", result: fallbackResult() }, { status: 503 });
    }

    const model = (process.env.AI_COUNSEL_MODEL ?? process.env.AI_ASSIST_MODEL ?? "gpt-4o-mini").trim();

    const jsonSchema = {
      name: "counsel_assist_result_v2",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          summary: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 5 },
          customerStage: { type: "string" },
          purchaseIntentScore: { type: "integer", minimum: 0, maximum: 100 },
          priceSensitivityScore: { type: "integer", minimum: 0, maximum: 100 },
          responseRiskScore: { type: "integer", minimum: 0, maximum: 100 },
          riskSignals: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 12 },
          recommendedAction: { type: "string" },
          recommendedActions: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 5 },
          messageSuggestions: {
            type: "array",
            minItems: 3,
            maxItems: 3,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                tone: { type: "string", enum: [...COUNSEL_ASSIST_MESSAGE_TONES] },
                text: { type: "string" },
              },
              required: ["tone", "text"],
            },
          },
          oneLineReply: { type: "string" },
          nextQuestions: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 2 },
          talkPoints: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 6 },
          cautionPhrases: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 },
          conversionLikelihoodNote: { type: "string" },
          pushOrPauseAdvice: { type: "string" },
        },
        required: [
          "summary",
          "customerStage",
          "purchaseIntentScore",
          "priceSensitivityScore",
          "responseRiskScore",
          "riskSignals",
          "recommendedAction",
          "recommendedActions",
          "messageSuggestions",
          "oneLineReply",
          "nextQuestions",
          "talkPoints",
          "cautionPhrases",
          "conversionLikelihoodNote",
          "pushOrPauseAdvice",
        ],
      },
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 55_000);

    let aiRes: Response;
    try {
      aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          temperature: 0.35,
          max_tokens: 2200,
          response_format: { type: "json_schema", json_schema: jsonSchema },
          messages: [
            { role: "developer", content: developerPrompt(options) },
            { role: "user", content: buildUserPrompt(context, options, manualInput) },
          ],
        }),
      });
    } finally {
      clearTimeout(timer);
    }

    const aiData = (await aiRes.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };

    if (!aiRes.ok) {
      console.error("[counsel-assist] OpenAI error", aiData.error);
      return NextResponse.json(
        { ok: false, error: aiData.error?.message ?? "AI 호출 실패", result: fallbackResult() },
        { status: 200 }
      );
    }

    const result = parseModelJson(aiData.choices?.[0]?.message?.content?.trim() ?? "");

    void saveAiCounselAnalysisDraft({
      leadId: context.leadId,
      generatedBy: requester.id,
      tone: options.uiTone,
      purpose: options.purpose,
      inputSnapshot: { context, manual: manualInput },
      summary: result.summary,
      scores: {
        purchaseIntentScore: result.purchaseIntentScore,
        priceSensitivityScore: result.priceSensitivityScore,
        responseRiskScore: result.responseRiskScore,
      },
      recommendedAction: result.recommendedAction,
      messageSuggestions: result.messageSuggestions,
      createdAt: new Date().toISOString(),
    }).catch((e) => {
      console.error("[counsel-assist] save stub failed", e);
    });

    return NextResponse.json({ ok: true, model, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "서버 오류";
    console.error("[counsel-assist]", error);
    return NextResponse.json({ ok: false, error: message, result: fallbackResult() }, { status: 200 });
  }
}
