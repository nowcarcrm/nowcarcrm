import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";

const ActionSchema = z.object({
  type: z.enum(["update_lead", "add_consultation"]),
  field: z.string().optional(),
  value: z.string().optional(),
  mode: z.enum(["replace", "append"]).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

const RequestSchema = z.object({
  message: z.string().min(1),
  conversationHistory: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1),
      })
    )
    .default([]),
  currentLeadId: z.string().uuid().optional(),
  tone: z.string().optional(),
  purpose: z.string().optional(),
});

const ResponseSchema = z.object({
  message: z.string().min(1),
  cards: z
    .array(
      z.object({
        type: z.enum(["ment", "analysis"]),
        title: z.string().optional(),
        content: z.string(),
      })
    )
    .optional(),
  actions: z.array(ActionSchema).optional(),
});

const SYSTEM_PROMPT = `너는 나우카 CRM의 통합 AI 코치 '나우AI'다.
대화 목적: 영업사원이 지금 바로 실행 가능한 조언/멘트/분석을 받는 것.

규칙:
1) 응답은 반드시 JSON.
2) 일반 답변은 message에 작성하고, 멘트 제안은 cards(type=ment)로, 분석은 cards(type=analysis)로 분리.
3) 고객 정보 변경 요청이 명확하면 actions 배열을 함께 제공.
4) 허용 액션:
   - update_lead: field(status|memo|sensitivity|priority), value, mode(append는 memo에서만)
   - add_consultation: payload에 memo/reaction/method/nextContactMemo 등 포함
5) 삭제/계약 민감정보 수정은 절대 제안하지 마.
6) 멘트는 뻔한 인사로 시작하지 말고, 상황 직답으로 시작.
7) 톤/목적과 직원 학습 데이터를 반드시 반영.
`;

function parseResponse(raw: string) {
  return ResponseSchema.parse(JSON.parse(raw.trim()));
}

async function loadLeadContext(leadId: string, requester: { id: string; role: string }) {
  let query = supabaseAdmin
    .from("leads")
    .select("id,name,car_model,source,status,sensitivity,manager_user_id,memo,next_contact_at")
    .eq("id", leadId);
  if (requester.role !== "admin" && requester.role !== "super_admin") {
    query = query.eq("manager_user_id", requester.id);
  }
  const { data: lead } = await query.maybeSingle();
  if (!lead) return "";

  const { data: recs } = await supabaseAdmin
    .from("consultations")
    .select("created_at,memo,reaction,method,next_contact_memo")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(8);

  const history = (recs ?? []).map((record, idx) => {
    const row = record as {
      memo?: string | null;
      reaction?: string | null;
      method?: string | null;
      next_contact_memo?: string | null;
    };
    return `${idx + 1}. ${row.memo ?? "기록 없음"} / 반응:${row.reaction ?? "-"} / 채널:${row.method ?? "-"} / 후속:${row.next_contact_memo ?? "-"}`;
  });

  return [
    "[고객 컨텍스트]",
    `고객명: ${lead.name}`,
    `관심차종: ${lead.car_model ?? "-"}`,
    `유입경로: ${lead.source ?? "-"}`,
    `상담결과: ${lead.status ?? "-"}`,
    `고객온도: ${lead.sensitivity ?? "-"}`,
    `메모: ${lead.memo ?? "-"}`,
    `다음 연락일: ${lead.next_contact_at ?? "-"}`,
    `상담 이력:\n${history.length > 0 ? history.join("\n") : "- 없음"}`,
  ].join("\n");
}

async function loadLearningContext(employeeId: string) {
  const { data } = await supabaseAdmin
    .from("ai_employee_learnings")
    .select("learning_type,content")
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false })
    .limit(30);

  const byType = {
    successful_ment: [] as string[],
    rejected_ment: [] as string[],
    feedback: [] as string[],
  };
  (data ?? []).forEach((row) => {
    const r = row as { learning_type?: string; content?: string | null };
    const content = (r.content ?? "").trim();
    if (!content) return;
    if (r.learning_type === "successful_ment" && byType.successful_ment.length < 5) byType.successful_ment.push(content);
    if (r.learning_type === "rejected_ment" && byType.rejected_ment.length < 3) byType.rejected_ment.push(content);
    if (r.learning_type === "feedback" && byType.feedback.length < 3) byType.feedback.push(content);
  });

  const lines = (items: string[]) => (items.length ? items.map((item, idx) => `${idx + 1}. ${item}`) : ["- 없음"]);
  return [
    "[이 영업사원의 스타일 학습 데이터]",
    "선호하는 멘트 패턴:",
    ...lines(byType.successful_ment),
    "",
    "선호하지 않는 패턴:",
    ...lines(byType.rejected_ment),
    "",
    "직원 직접 피드백:",
    ...lines(byType.feedback),
  ].join("\n");
}

export async function POST(req: Request) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  try {
    const body = RequestSchema.safeParse(await req.json());
    if (!body.success) return NextResponse.json({ ok: false, error: "요청 형식이 올바르지 않습니다." }, { status: 400 });

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) return NextResponse.json({ ok: false, error: "OPENAI_API_KEY가 설정되지 않았습니다." }, { status: 503 });

    const { message, conversationHistory, currentLeadId, tone, purpose } = body.data;
    const [leadContext, learningContext] = await Promise.all([
      currentLeadId ? loadLeadContext(currentLeadId, auth.requester) : Promise.resolve(""),
      loadLearningContext(auth.requester.id),
    ]);

    const userContext = [
      tone ? `톤: ${tone}` : "",
      purpose ? `목적: ${purpose}` : "",
      leadContext,
      learningContext,
      "",
      "[요청]",
      message,
    ]
      .filter(Boolean)
      .join("\n\n");

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0.45,
        max_tokens: 1400,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...conversationHistory.slice(-8),
          { role: "user", content: userContext },
        ],
      }),
    });

    const aiData = (await aiRes.json()) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
    if (!aiRes.ok) {
      return NextResponse.json({ ok: false, error: aiData.error?.message ?? "OpenAI 호출 실패" }, { status: 502 });
    }
    const raw = aiData.choices?.[0]?.message?.content ?? "";
    const parsed = parseResponse(raw);
    return NextResponse.json({ ok: true, result: parsed });
  } catch (error) {
    const message = error instanceof Error ? error.message : "서버 오류";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
