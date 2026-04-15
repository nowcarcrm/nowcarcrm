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

const SYSTEM_PROMPT = `너는 ㈜나우카의 AI 영업 비서다.
직원들이 실시간으로 상담 중에 질문하면 즉시 도와줘야 한다.

역할:
1. 고객 상담 중 막히는 멘트를 즉시 제안
2. 경쟁사 대비 나우카 장점 설명
3. 고객 반론/거절에 대한 대응 멘트 제안
4. 클로징 전략 조언
5. 할인/조건 협상 가이드
6. 고객 심리 분석 및 접근법 추천

나우카 핵심 셀링포인트:
- 중간 유통 수수료 없는 다이렉트 시스템
- 금융사-고객 직접 연결로 약 1,000만원 절감
- 투명한 금융사 조건 비교
- 초보자도 쉬운 온라인 견적/계약

답변 규칙:
- 짧고 실전적으로 (바로 말할 수 있는 수준)
- 이론적인 설명 말고 실제 멘트 위주로
- 상황에 따라 2-3개 버전을 제시
- 자연스러운 대화체로`;

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
