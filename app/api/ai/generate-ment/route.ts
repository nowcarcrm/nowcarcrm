import { NextResponse } from "next/server";
import { z } from "zod";

const RequestSchema = z.object({
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
  }),
  timing: z.string().min(1),
});

const SYSTEM_PROMPT = `너는 대한민국 최고의 신차 장기렌트/리스 전문 영업 컨설턴트다.
회사명: ㈜나우카 (now car)
업종: 신차 장기렌트/리스 전문 에이전시 (중고차 아님)
핵심 시스템: 금융사-고객 직접 연결형 다이렉트 시스템

■ 나우카 핵심 셀링포인트 (상황에 맞게 1-2개만 자연스럽게 반영):
1. 중간 유통 수수료 없는 다이렉트 시스템
2. 금융사-고객 직접 연결로 약 1,000만원 절감
3. 투명한 금융사 조건 비교 시스템
4. 초보자도 쉬운 온라인 견적/계약

■ 톤별 가이드:
- 친절형: 따뜻하고 배려. "~해드릴게요", "~도와드릴 수 있어요"
- 설득형: 논리적, 데이터 기반. "~기준으로 보시면", "비교해보시면"
- 단호형: 확신, 직접적. "지금 잡으셔야 합니다", "이건 확실합니다"
- 대표형: 리더/전문가. "제가 직접 확인해봤는데", "업계 상황을 보면"

■ 멘트 규칙:
- 실제 전화/카톡/문자에서 바로 쓸 수 있는 자연스러운 말투
- 고객 상황에 맞는 맞춤형 (관심차종, 예산, 단계 반영)
- 무조건 좋다고만 X, 현실적 시각 + 신뢰감
- 매번 같은 패턴 반복 금지

■ 반드시 아래 JSON 형식으로만 응답해. 다른 텍스트 없이 JSON만:
{
  "mainMent": "메인 추천 멘트",
  "altMent1": "대안 멘트 1",
  "altMent2": "대안 멘트 2",
  "analysis": {
    "customerTemperature": "HOT/WARM/COLD",
    "urgencyLevel": "긴급/보통/여유",
    "keyPoint": "핵심 포인트 한줄",
    "cautionNote": "주의할 점",
    "nextAction": "다음 행동 추천"
  },
  "timing": "멘트 보내기 좋은 타이밍"
}`;

function stringifyInput(input: unknown) {
  if (typeof input === "string") return input;
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input ?? "");
  }
}

function parseModelContent(raw: string) {
  const trimmed = raw.trim();
  const parsed = JSON.parse(trimmed);
  return ResponseSchema.parse(parsed);
}

export async function POST(req: Request) {
  try {
    const body = RequestSchema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json(
        { ok: false, error: "요청 형식이 올바르지 않습니다. { tone, purpose, customerInfo, consultationHistory }를 확인해 주세요." },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "OPENAI_API_KEY가 설정되지 않았습니다." }, { status: 503 });
    }

    const { tone, purpose, customerInfo, consultationHistory } = body.data;
    const userPrompt = [
      "아래 고객 정보를 바탕으로 멘트 3개와 분석을 JSON으로 생성해줘.",
      `- 선택 톤: ${tone}`,
      `- 상담 목적: ${purpose}`,
      "",
      "[customerInfo]",
      stringifyInput(customerInfo),
      "",
      "[consultationHistory]",
      stringifyInput(consultationHistory),
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
