import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin, supabaseAuthVerifier } from "@/app/_lib/supabaseAdminServer";

const AssistRequestSchema = z.object({
  messages: z.array(z.string()).default([]),
  input: z.string().min(1),
  leadId: z.string().min(1).optional(),
});

const AssistResponseSchema = z.object({
  reply_suggestion: z.string().min(1),
  summary: z.string().min(1),
  status: z.enum(["exploring", "interested", "closing"]),
  next_action: z.string().min(1),
});

type AssistResponse = z.infer<typeof AssistResponseSchema>;

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

function developerPrompt() {
  return [
    "너는 자동차 상담 전문가다.",
    "목표는 계약 성사 확률을 높이는 것이다.",
    "답변은 짧고 실무적으로 작성한다.",
    "JSON 외 텍스트를 절대 출력하지 마라.",
    "reply_suggestion은 1~2문장, summary는 1문장, next_action은 1문장.",
    "status는 exploring/interested/closing 중 하나만 반환한다.",
  ].join("\n");
}

function mapTagToLeadStatus(tag: AssistResponse["status"]) {
  if (tag === "closing") return "확정";
  if (tag === "interested") return "계약완료";
  return "상담중";
}

function fallbackResponse(): AssistResponse {
  return {
    reply_suggestion:
      "고객님 조건 기준으로 부담을 줄일 수 있는 방향을 다시 정리해 안내드리겠습니다.",
    summary: "조건 재정리가 필요한 상담 진행 고객입니다.",
    status: "exploring",
    next_action: "24시간 내 재연락으로 예산/차종 우선순위를 다시 확인하세요.",
  };
}

function parseModelOutput(raw: string): AssistResponse {
  try {
    return AssistResponseSchema.parse(JSON.parse(raw));
  } catch (error) {
    console.error("[ai/assist] parse failed", { error, raw });
    return fallbackResponse();
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

    const bodyParsed = AssistRequestSchema.safeParse(await req.json());
    if (!bodyParsed.success) {
      return NextResponse.json({ error: "messages, input 형식을 확인해 주세요." }, { status: 400 });
    }
    const { messages, input, leadId } = bodyParsed.data;

    let leadContext = "";
    if (leadId) {
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
      if (lead) {
        const { data: recs } = await supabaseAdmin
          .from("consultations")
          .select("created_at,memo,reaction,method")
          .eq("lead_id", lead.id)
          .order("created_at", { ascending: false })
          .limit(3);
        const recent = (recs ?? []).map((r, idx) => {
          const rr = r as { memo?: string | null; reaction?: string | null; method?: string | null };
          return `${idx + 1}. ${(rr.memo ?? "").trim() || "기록 없음"}${rr.reaction ? ` / 반응: ${rr.reaction}` : ""}${rr.method ? ` / 방식: ${rr.method}` : ""}`;
        });
        leadContext = [
          `고객명: ${lead.name}`,
          `현재 상담결과: ${lead.status}`,
          `차량: ${lead.car_model || "-"}`,
          `다음연락예정일: ${lead.next_contact_at?.slice(0, 10) ?? "-"}`,
          `최근 상담기록:\n${recent.length > 0 ? recent.join("\n") : "- 없음"}`,
        ].join("\n");
      }
    }

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY가 설정되지 않았습니다." }, { status: 503 });
    }
    const model = (process.env.AI_ASSIST_MODEL ?? "gpt-4o-mini").trim() || "gpt-4o-mini";

    const userPrompt = [
      "입력:",
      leadContext || "고객 컨텍스트 없음",
      `최근 대화: ${messages.slice(-6).join(" | ") || "-"}`,
      `현재 직원 입력: ${input}`,
      "",
      "출력:",
      '{"reply_suggestion":"","summary":"","status":"exploring | interested | closing","next_action":""}',
    ].join("\n");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);
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
        max_tokens: 220,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "crm_assist_result",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                reply_suggestion: { type: "string" },
                summary: { type: "string" },
                status: { type: "string", enum: ["exploring", "interested", "closing"] },
                next_action: { type: "string" },
              },
              required: ["reply_suggestion", "summary", "status", "next_action"],
            },
          },
        },
        messages: [
          { role: "developer", content: developerPrompt() },
          { role: "user", content: userPrompt },
        ],
      }),
    }).finally(() => clearTimeout(timeout));

    const aiData = (await aiRes.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };
    if (!aiRes.ok) {
      return NextResponse.json(
        { error: aiData.error?.message ?? "AI 호출 실패", result: fallbackResponse() },
        { status: 200 }
      );
    }

    const content = aiData.choices?.[0]?.message?.content?.trim() ?? "";
    const result = parseModelOutput(content);

    if (leadId) {
      const leadStatus = mapTagToLeadStatus(result.status);
      const { error: upErr } = await supabaseAdmin
        .from("leads")
        .update({
          summary_text: result.summary,
          next_action: result.next_action,
          customer_intent: result.status,
          status: leadStatus,
        })
        .eq("id", leadId);
      if (upErr) {
        console.error("[ai/assist] lead update failed", upErr);
      }
    }

    return NextResponse.json({ ok: true, model, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "서버 오류";
    return NextResponse.json(
      { ok: true, error: message, result: fallbackResponse() },
      { status: 200 }
    );
  }
}
