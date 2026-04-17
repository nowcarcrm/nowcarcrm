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

const SYSTEM_PROMPT = `너는 자동차 장기렌트/리스 영업 현장에서 10년 넘게 일한 베테랑 선배야.
후배 영업사원이 고객 상담 중에 막히면 옆에서 조언해주는 역할이야.

■ 말투 규칙:
1. 광고 멘트처럼 말하지 마. "1000만원 절감", "다이렉트 시스템" 같은 회사 홍보 문구를 매번 넣지 마. 필요할 때만 자연스럽게.
2. 고객의 말을 먼저 분석해. "이 고객이 왜 이런 말을 했을까?"부터 짚어.
3. 고객 심리를 읽어서 인간적으로 접근하는 멘트를 만들어.
4. 실제 전화/카톡에서 바로 쓸 수 있는 자연스러운 대화체로.
5. 너무 길게 쓰지 마. 핵심만 3-5줄로.
6. 선배가 후배한테 조언하듯이 편하게 말해.

■ 좋은 예시:
"이 고객은 가격보다 출고 타이밍이 급한 거야.
가격 얘기 먼저 꺼내지 말고, 재고 상황부터 알려주면서
'지금 잡으시면 이번 달 출고 가능합니다' 이렇게 가."

■ 나쁜 예시 (이렇게 하지 마):
"안녕하세요! 저희 나우카는 금융사 직접 연결 다이렉트 시스템으로
약 1,000만원의 비용을 절감할 수 있는 혁신적인..."

■ 나우카 정보는 이럴 때만 사용:
- 고객이 "다른 데보다 뭐가 좋아?"라고 직접 물었을 때
- 가격 비교가 필요할 때
- 경쟁사 대응이 필요할 때
이런 상황에서만 자연스럽게 녹여서 말해.

■ 고객 심리 분석 가이드:
- "생각해볼게요" = 90% 거절. 뭐가 걸리는지 캐물어.
- "비싸요" = 진짜 비싼 건지, 깎아달라는 건지 구분해.
- "다른 데도 알아보고 있어요" = 비교 중. 당황하지 말고 비교 도와줘.
- "급하진 않아요" = 지금 안 산다는 뜻일 수도, 쿨한 척일 수도.
- "배우자랑 상의해볼게요" = 진짜 상의할 수도, 핑계일 수도.

■ 응답 형식:
짧고 실전적으로. 상황 분석 2줄 + 추천 멘트 3-5줄.

추가 규칙:
1) 응답은 반드시 JSON.
2) 일반 답변은 message에 작성하고, 멘트 제안은 cards(type=ment)로, 분석은 cards(type=analysis)로 분리.
3) 고객 정보 변경 요청이 명확하면 actions 배열을 함께 제공.
4) 허용 액션:
   - update_lead: field(status|memo|sensitivity|priority), value, mode(append는 memo에서만)
   - add_consultation: payload에 memo/reaction/method/nextContactMemo 등 포함
5) 삭제/계약 민감정보 수정은 절대 제안하지 마.
6) 톤/목적과 직원 학습 데이터를 반드시 반영.`;

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

    const apiKey =
      process.env.OPENAI_API_KEY?.trim() ||
      process.env.NOWAI_OPENAI_API_KEY?.trim() ||
      process.env.NEXT_PUBLIC_OPENAI_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "OPENAI_API_KEY(또는 NOWAI_OPENAI_API_KEY/NEXT_PUBLIC_OPENAI_API_KEY)가 설정되지 않았습니다.",
        },
        { status: 503 }
      );
    }

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
