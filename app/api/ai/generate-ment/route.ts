import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";

const RequestSchema = z.object({
  employeeId: z.string().uuid(),
  tone: z.string().min(1),
  purpose: z.string().min(1),
  customerInfo: z
    .union([z.string(), z.record(z.string(), z.unknown())])
    .optional()
    .default(""),
  consultationHistory: z
    .union([z.string(), z.array(z.unknown()), z.record(z.string(), z.unknown())])
    .optional()
    .default(""),
});

const ResponseSchema = z.object({
  mainMent: z.string().min(1),
  altMent1: z.string().min(1),
  altMent2: z.string().min(1),
  analysis: z.object({
    customerTemperature: z.enum(["HOT", "WARM", "COLD"]),
    urgencyLevel: z.enum(["긴급", "보통", "여유"]),
    keyPoint: z.string().min(1),
    cautionNote: z.string().min(1),
    nextAction: z.string().min(1),
    customerPsychology: z.string().min(1),
  }),
  timing: z.string().min(1),
});

const SYSTEM_PROMPT = `너는 대한민국 최고의 신차 장기렌트/리스 영업 전문가이자,
영업사원의 실시간 코치다.

회사: ㈜나우카 (now car)
업종: 신차 장기렌트/리스 전문 에이전시 (중고차 아님)
핵심: 금융사-고객 직접 연결 다이렉트 시스템

■ 너의 역할:
영업사원이 고객과의 실제 상담 내용을 알려주면,
그 상황을 정확히 분석하고 구체적인 솔루션을 제시해야 한다.
뻔한 인사말이나 일반적인 멘트가 아니라,
"지금 이 상황에서 정확히 이렇게 말해라"를 알려줘야 한다.

■ 분석 순서 (반드시 이 순서로):
1. 상황 파악: 고객이 지금 어떤 상태인지 정확히 짚어라
   - 비교 중인지, 망설이는지, 가격 때문인지, 타이밍 때문인지
   - 고객의 진짜 고민이 뭔지 읽어내라

2. 고객 심리 분석: 고객이 이 말을 왜 하는지 해석해라
   - "생각해보고 연락주겠다" = 거절 시그널? 진짜 고민 중?
   - "다른 데도 알아보고 있다" = 가격 협상? 진짜 비교 중?
   - "할인이 별로다" = 더 깎아달라? 경쟁사가 더 싸다?

3. 전략 제시: 이 상황에서 어떤 전략으로 접근해야 하는지
   - 밀어야 하는지, 당겨야 하는지
   - 가격으로 승부할지, 서비스로 승부할지, 긴급성으로 승부할지

4. 실전 멘트: 바로 말할 수 있는 구체적인 대화 멘트
   - 전화용이면 전화 멘트로
   - 카톡이면 카톡 스타일로
   - 실제로 입에서 나올 수 있는 자연스러운 말투로

5. 주의사항: 이 상황에서 하면 안 되는 것

■ 나우카 핵심 무기 (상황에 맞게 활용):
- 중간 수수료 없는 다이렉트 → 같은 차인데 수백만원 차이
- 금융사 직접 연결 → 이자율/조건을 투명하게 비교
- 약 1,000만원 절감 → "같은 차, 같은 조건인데 왜 더 비싸게 하세요?"
- 온라인 견적 시스템 → 바로 비교 가능

■ 응답 형식 (반드시 JSON):
{
  "mainMent": "가장 강력한 실전 멘트 (바로 복사해서 쓸 수 있는 수준)",
  "altMent1": "다른 접근법의 멘트 (mainMent와 다른 전략)",
  "altMent2": "세 번째 접근법 (가장 부드러운 버전)",
  "analysis": {
    "customerTemperature": "HOT/WARM/COLD",
    "urgencyLevel": "긴급/보통/여유",
    "keyPoint": "이 고객의 핵심 포인트 (예: 가격 민감, 비교 중, 출고 급함)",
    "cautionNote": "이 상황에서 절대 하면 안 되는 것",
    "nextAction": "이 통화/대화 끝나고 다음에 해야 할 구체적 행동",
    "customerPsychology": "고객이 지금 이 말을 하는 진짜 이유 분석"
  },
  "timing": "이 멘트를 언제 보내면 가장 효과적인지"
}`;

function stringifyInput(input: unknown) {
  if (typeof input === "string") return input;
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input ?? "");
  }
}

function toRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return input as Record<string, unknown>;
}

function toStringValue(value: unknown, fallback = "미입력") {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || fallback;
  }
  if (Array.isArray(value)) {
    const joined = value
      .map((item) => (typeof item === "string" ? item.trim() : String(item ?? "")))
      .filter(Boolean)
      .join(", ");
    return joined || fallback;
  }
  if (value == null) return fallback;
  return String(value);
}

function parseModelContent(raw: string) {
  const trimmed = raw.trim();
  const parsed = JSON.parse(trimmed);
  return ResponseSchema.parse(parsed);
}

type LearningType = "successful_ment" | "rejected_ment" | "feedback";

async function fetchLearningTexts(employeeId: string, learningType: LearningType, limit: number) {
  const { data, error } = await supabaseAdmin
    .from("ai_employee_learnings")
    .select("content")
    .eq("employee_id", employeeId)
    .eq("learning_type", learningType)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[generate-ment] learning fetch failed", { employeeId, learningType, error: error.message });
    return [] as string[];
  }

  return (data ?? [])
    .map((row) => {
      const content = (row as { content?: string | null }).content ?? "";
      return content.trim();
    })
    .filter(Boolean);
}

function numberedLines(lines: string[]) {
  if (lines.length === 0) return ["- 없음"];
  return lines.map((line, idx) => `${idx + 1}. ${line}`);
}

export async function POST(req: Request) {
  try {
    const body = RequestSchema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json(
        { ok: false, error: "요청 형식이 올바르지 않습니다. { employeeId, tone, purpose, customerInfo, consultationHistory }를 확인해 주세요." },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "OPENAI_API_KEY가 설정되지 않았습니다." }, { status: 503 });
    }

    const { employeeId, tone, purpose, customerInfo, consultationHistory } = body.data;
    const customer = toRecord(customerInfo);
    const customerName = toStringValue(customer.name);
    const interestedCar = toStringValue(customer.desiredVehicle);
    const source = toStringValue(customer.source);
    const channel = toStringValue(customer.recentChannel, "미확인");
    const selectedTags = toStringValue(customer.objections, "없음");
    const consultationDetail = toStringValue(customer.reactionSummary, stringifyInput(consultationHistory));
    const additionalNotes = toStringValue(customer.objectionsFreeText, "없음");
    const [successfulMents, rejectedMents, feedbacks] = await Promise.all([
      fetchLearningTexts(employeeId, "successful_ment", 5),
      fetchLearningTexts(employeeId, "rejected_ment", 3),
      fetchLearningTexts(employeeId, "feedback", 3),
    ]);

    const userPrompt = [
      "[상담 상황]",
      `고객명: ${customerName}`,
      `관심차종: ${interestedCar}`,
      `유입경로: ${source}`,
      `상담채널: ${channel} (전화/카톡/문자)`,
      `고객 현재 반응 태그: ${selectedTags}`,
      "",
      "[직원이 입력한 상담 내용]",
      consultationDetail,
      "",
      "[추가 특이사항]",
      additionalNotes,
      "",
      "[요청]",
      `톤: ${tone}`,
      `목적: ${purpose}`,
      "",
      "위 상담 상황을 분석하고, 이 고객에게 지금 바로 쓸 수 있는",
      "실전 멘트를 만들어줘. 뻔한 인사말이 아니라",
      "이 상황에 딱 맞는 구체적인 솔루션과 대화 멘트가 필요해.",
      "",
      "[참고 원본 데이터]",
      `customerInfo: ${stringifyInput(customerInfo)}`,
      `consultationHistory: ${stringifyInput(consultationHistory)}`,
      "",
      "[이 영업사원의 스타일 학습 데이터]",
      "",
      "선호하는 멘트 패턴 (이전에 복사해서 사용한 멘트들):",
      ...numberedLines(successfulMents),
      "",
      "선호하지 않는 패턴 (사용 안 한 멘트들):",
      ...numberedLines(rejectedMents),
      "",
      "직원 직접 피드백:",
      ...numberedLines(feedbacks),
      "",
      "위 학습 데이터를 참고해서, 이 영업사원의 스타일에 맞는",
      "멘트를 생성해줘. 선호하는 패턴과 비슷하게,",
      "선호하지 않는 패턴은 피하면서 작성해.",
    ].join("\n");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

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
          model: "gpt-4o",
          temperature: 0.5,
          max_tokens: 1200,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
        }),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return NextResponse.json({ ok: false, error: "AI 응답이 지연되어 타임아웃되었습니다. 잠시 후 다시 시도해 주세요." }, { status: 504 });
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    const aiData = (await aiRes.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };

    if (!aiRes.ok) {
      return NextResponse.json(
        { ok: false, error: aiData.error?.message ?? "OpenAI API 호출에 실패했습니다." },
        { status: 502 }
      );
    }

    const rawContent = aiData.choices?.[0]?.message?.content ?? "";
    if (!rawContent.trim()) {
      return NextResponse.json({ ok: false, error: "AI 응답이 비어 있습니다." }, { status: 502 });
    }

    try {
      const result = parseModelContent(rawContent);
      return NextResponse.json({ ok: true, result, model: "gpt-4o" });
    } catch {
      return NextResponse.json(
        { ok: false, error: "AI 응답 JSON 형식이 올바르지 않습니다. 다시 시도해 주세요." },
        { status: 502 }
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "서버 오류";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
