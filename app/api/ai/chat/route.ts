import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";

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
  currentLeadId: z.string().min(1).optional(),
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
짧고 실전적으로. 상황 분석 2줄 + 추천 멘트 3-5줄.`;

async function loadLeadContext(currentLeadId: string, requester: { id: string; role: string }) {
  let query = supabaseAdmin
    .from("leads")
    .select("id,name,car_model,status,next_contact_at,manager_user_id")
    .eq("id", currentLeadId);

  if (requester.role !== "admin" && requester.role !== "super_admin") {
    query = query.eq("manager_user_id", requester.id);
  }

  const { data: lead } = await query.maybeSingle();
  if (!lead) return "";

  const { data: recs } = await supabaseAdmin
    .from("consultations")
    .select("created_at,memo,reaction,method")
    .eq("lead_id", lead.id)
    .order("created_at", { ascending: false })
    .limit(3);

  const recent = (recs ?? []).map((r, idx) => {
    const row = r as { memo?: string | null; reaction?: string | null; method?: string | null };
    return `${idx + 1}. ${(row.memo ?? "").trim() || "기록 없음"}${row.reaction ? ` / 반응: ${row.reaction}` : ""}${row.method ? ` / 방식: ${row.method}` : ""}`;
  });

  return [
    "[현재 고객 컨텍스트]",
    `고객명: ${lead.name}`,
    `차종: ${lead.car_model || "-"}`,
    `상태: ${lead.status || "-"}`,
    `다음 연락일: ${lead.next_contact_at?.slice(0, 10) ?? "-"}`,
    `최근 상담 기록:\n${recent.length > 0 ? recent.join("\n") : "- 없음"}`,
  ].join("\n");
}

export async function POST(req: Request) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  try {
    const parsed = RequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "OPENAI_API_KEY가 설정되지 않았습니다." }, { status: 503 });
    }

    const { message, conversationHistory, currentLeadId } = parsed.data;
    const leadContext = currentLeadId ? await loadLeadContext(currentLeadId, auth.requester) : "";

    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [{ role: "system", content: SYSTEM_PROMPT }];
    if (leadContext) messages.push({ role: "system", content: leadContext });
    conversationHistory.slice(-8).forEach((item) => messages.push(item));
    messages.push({ role: "user", content: message });

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.5,
        max_tokens: 700,
        messages,
      }),
    });

    const aiData = (await aiRes.json()) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
    if (!aiRes.ok) {
      return NextResponse.json({ ok: false, error: aiData.error?.message ?? "OpenAI 호출 실패" }, { status: 502 });
    }

    const reply = aiData.choices?.[0]?.message?.content?.trim() ?? "";
    if (!reply) return NextResponse.json({ ok: false, error: "AI 응답이 비어 있습니다." }, { status: 502 });
    return NextResponse.json({ ok: true, reply });
  } catch (error) {
    const message = error instanceof Error ? error.message : "서버 오류";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
