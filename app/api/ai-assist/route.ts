import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin, supabaseAuthVerifier } from "@/app/_lib/supabaseAdminServer";

const AiAssistRequestSchema = z.object({
  leadId: z.string().min(1),
  question: z.string().min(1),
});

const AiAssistResponseSchema = z.object({
  summary: z.string().min(1),
  advice: z.string().min(1),
  suggested_message: z.string().min(1),
  tone_variants: z.object({
    short: z.string().min(1),
    soft: z.string().min(1),
    strong: z.string().min(1),
  }),
});

type AiAssistResponse = z.infer<typeof AiAssistResponseSchema>;

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

async function getRequester(authUserId: string) {
  const { data: byId, error: e1 } = await supabaseAdmin
    .from("users")
    .select("id, role, approval_status")
    .eq("id", authUserId)
    .maybeSingle();
  if (e1) return { row: null, error: e1 };
  if (byId) return { row: byId, error: null };
  const { data: legacy, error: e2 } = await supabaseAdmin
    .from("users")
    .select("id, role, approval_status")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  return { row: legacy, error: e2 };
}

function buildDeveloperPrompt() {
  return [
    "너는 NOWCAR CRM 내부의 상담 어시스트다.",
    "역할: 자동차 CRM 상담 코치. 직원의 말하기/다음 행동을 짧게 돕는 보조 도구다.",
    "항상 짧고 실무형으로 답한다. 장황한 설명, 일반론, 주의사항 나열 금지.",
    "고객 상태 변경을 단정 지시하지 말고, 반드시 추천 형태로 표현한다.",
    "출력은 JSON 스키마를 반드시 지켜라.",
    "summary: 1문장, advice: 1문장, suggested_message: 1~2문장, tone_variants 각 1문장.",
    "메시지 초안은 한국어로 바로 복붙 가능하게 작성한다.",
    "tone_variants는 short(짧게), soft(부드럽게), strong(적극적으로) 톤을 준다.",
    "본 JSON 외 텍스트를 절대 출력하지 마라.",
  ].join("\n");
}

function stageLabelFromStatus(status: string): string {
  switch (status) {
    case "신규":
      return "신규";
    case "상담중":
      return "상담중";
    case "부재":
      return "부재";
    case "계약완료":
    case "확정":
      return "계약";
    case "출고":
      return "출고";
    case "인도완료":
      return "인도완료";
    case "보류":
      return "보류";
    case "취소":
      return "취소";
    default:
      return "상담중";
  }
}

function fallbackResult(): AiAssistResponse {
  return {
    summary: "최근 상담기록 기준으로 조건 재확인이 필요한 고객입니다.",
    advice: "가격 부담 대응 메시지를 먼저 보내고, 2일 내 재연락을 추천합니다.",
    suggested_message:
      "고객님, 말씀 주신 조건 기준으로 부담을 줄일 수 있는 방향을 다시 정리해 안내드리겠습니다.",
    tone_variants: {
      short: "조건 다시 정리해서 바로 안내드리겠습니다.",
      soft: "부담을 줄일 수 있는 방향으로 다시 안내드려도 괜찮을까요?",
      strong: "지금 조건 기준으로 가장 유리한 방향을 빠르게 정리해드리겠습니다.",
    },
  };
}

function buildUserContext(input: {
  lead: {
    name: string;
    status: string;
    car_model: string;
    next_contact_at: string | null;
  };
  records: Array<{
    created_at: string | null;
    method: string | null;
    memo: string | null;
    reaction: string | null;
  }>;
  contract: Record<string, unknown> | null;
  question: string;
}) {
  const recent = input.records.slice(0, 3).map((r, idx) => {
    const content = (r.memo ?? "").trim();
    const reaction = (r.reaction ?? "").trim();
    const method = (r.method ?? "").trim();
    return `${idx + 1}. ${content || "기록 없음"}${reaction ? ` / 반응: ${reaction}` : ""}${method ? ` / 방식: ${method}` : ""}`;
  });
  const contractVehicle = String(input.contract?.vehicle_name ?? "").trim();
  const contractMonthly = String(input.contract?.monthly_payment ?? "").trim();
  const contractTerm = String(input.contract?.contract_term ?? "").trim();

  return [
    `고객명: ${input.lead.name}`,
    `현재 단계: ${stageLabelFromStatus(input.lead.status)}`,
    `현재 상담결과: ${input.lead.status}`,
    `최근 상담기록:\n${recent.length > 0 ? recent.join("\n") : "- 없음"}`,
    `차량/예산/조건: 차량=${input.lead.car_model || "-"}${contractVehicle ? `, 계약차량=${contractVehicle}` : ""}${contractMonthly ? `, 월납입=${contractMonthly}` : ""}${contractTerm ? `, 기간=${contractTerm}` : ""}`,
    `다음 연락 예정일: ${input.lead.next_contact_at?.slice(0, 10) ?? "-"}`,
    `직원 질문: "${input.question}"`,
  ].join("\n");
}

function safeParseAiResult(raw: string): AiAssistResponse {
  try {
    const parsed = JSON.parse(raw);
    const validated = AiAssistResponseSchema.parse(parsed);
    return validated;
  } catch (error) {
    console.error("[ai-assist] parse/validation failed", { raw, error });
    return fallbackResult();
  }
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: "인증 토큰이 없습니다." }, { status: 401 });
    }

    const { data: authData, error: authErr } = await supabaseAuthVerifier.auth.getUser(token);
    if (authErr || !authData.user) {
      return NextResponse.json({ error: "유효하지 않은 인증입니다." }, { status: 401 });
    }

    const { row: requester, error: requesterErr } = await getRequester(authData.user.id);
    if (requesterErr || !requester) {
      return NextResponse.json({ error: "직원 계정 확인에 실패했습니다." }, { status: 403 });
    }
    const approved = requester.approval_status === "approved";
    const role = requester.role;
    if (!approved || (role !== "admin" && role !== "manager" && role !== "staff")) {
      return NextResponse.json({ error: "접근 권한이 없습니다." }, { status: 403 });
    }

    const bodyParsed = AiAssistRequestSchema.safeParse(await req.json());
    if (!bodyParsed.success) {
      return NextResponse.json({ error: "leadId, question이 필요합니다." }, { status: 400 });
    }
    const { leadId, question } = bodyParsed.data;

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY가 설정되지 않았습니다." },
        { status: 503 }
      );
    }

    let leadQuery = supabaseAdmin
      .from("leads")
      .select("id,name,car_model,status,next_contact_at,manager_user_id")
      .eq("id", leadId);
    if (role !== "admin") {
      leadQuery = leadQuery.eq("manager_user_id", requester.id);
    }
    const { data: lead, error: leadErr } = await leadQuery.maybeSingle();
    if (leadErr) {
      return NextResponse.json({ error: `고객 조회 실패: ${leadErr.message}` }, { status: 500 });
    }
    if (!lead) {
      return NextResponse.json({ error: "고객을 찾을 수 없거나 접근 권한이 없습니다." }, { status: 404 });
    }

    const [{ data: records, error: recErr }, { data: contract, error: contractErr }] =
      await Promise.all([
        supabaseAdmin
          .from("consultations")
          .select("created_at,method,memo,reaction")
          .eq("lead_id", leadId)
          .order("created_at", { ascending: false })
          .limit(3),
        supabaseAdmin
          .from("contracts")
          .select("*")
          .eq("lead_id", leadId)
          .order("contract_date", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
    if (recErr) {
      console.warn("[ai-assist] consultations load failed", recErr.message);
    }
    if (contractErr) {
      console.warn("[ai-assist] contracts load failed", contractErr.message);
    }

    const userContext = buildUserContext({
      lead: lead as { name: string; status: string; car_model: string; next_contact_at: string | null },
      records: (records ?? []) as Array<{
        created_at: string | null;
        method: string | null;
        memo: string | null;
        reaction: string | null;
      }>,
      contract: (contract as Record<string, unknown> | null) ?? null,
      question,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6500);
    const model = (process.env.AI_ASSIST_MODEL ?? "gpt-4o-mini").trim() || "gpt-4o-mini";

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 320,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "ai_assist_response",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                summary: { type: "string" },
                advice: { type: "string" },
                suggested_message: { type: "string" },
                tone_variants: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    short: { type: "string" },
                    soft: { type: "string" },
                    strong: { type: "string" },
                  },
                  required: ["short", "soft", "strong"],
                },
              },
              required: ["summary", "advice", "suggested_message", "tone_variants"],
            },
          },
        },
        messages: [
          { role: "developer", content: buildDeveloperPrompt() },
          { role: "user", content: userContext },
        ],
      }),
    }).finally(() => clearTimeout(timeout));

    const aiData = (await aiRes.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };
    if (!aiRes.ok) {
      return NextResponse.json(
        { error: aiData.error?.message ?? "AI 호출 실패" },
        { status: aiRes.status }
      );
    }

    const content = aiData.choices?.[0]?.message?.content?.trim() ?? "";
    const result = safeParseAiResult(content);
    return NextResponse.json({
      ok: true,
      model,
      result,
      schema: "ai_assist_response",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "서버 오류";
    const isTimeout = message.toLowerCase().includes("abort");
    return NextResponse.json(
      {
        ok: true,
        model: (process.env.AI_ASSIST_MODEL ?? "gpt-4o-mini").trim() || "gpt-4o-mini",
        error: isTimeout ? "AI 응답 시간이 초과되었습니다." : message,
        result: fallbackResult(),
      },
      { status: 200 }
    );
  }
}
