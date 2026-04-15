import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";
import { emitToUserRoom } from "@/app/_lib/socketGateway";
import { REALTIME_EVENTS } from "@/app/_lib/realtimeEvents";
import { getRequesterFromToken } from "../_lib";

const BodySchema = z.object({
  leadId: z.string().min(1),
  eventType: z.enum(["new-lead-assigned", "lead-reassigned"]),
  toUserId: z.string().min(1).optional(),
  previousUserId: z.string().optional(),
});

async function generateAiOneLine(summary: { name: string; carModel: string; source: string }) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return "신규 고객 반응이 빠를수록 전환 가능성이 높습니다.";

  const prompt = [
    "신차 장기렌트 CRM 알림용 한줄 분석을 한국어 1문장으로 작성해줘.",
    "80자 이내, 과장 없이 실무형 톤.",
    `고객명:${summary.name}, 관심차종:${summary.carModel}, 유입경로:${summary.source}`,
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
        temperature: 0.3,
        max_tokens: 120,
        messages: [
          { role: "system", content: "짧은 실무 코멘트만 반환해." },
          { role: "user", content: prompt },
        ],
      }),
    });
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const line = json.choices?.[0]?.message?.content?.trim();
    if (!line) return "신규 고객 반응이 빠를수록 전환 가능성이 높습니다.";
    return line.slice(0, 120);
  } catch {
    return "신규 고객 반응이 빠를수록 전환 가능성이 높습니다.";
  }
}

export async function POST(req: Request) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const { leadId, eventType, toUserId } = parsed.data;
  const { data: lead, error: leadErr } = await supabaseAdmin
    .from("leads")
    .select("id,name,car_model,source,manager_user_id")
    .eq("id", leadId)
    .maybeSingle();
  if (leadErr || !lead) {
    return NextResponse.json({ error: "고객 조회에 실패했습니다." }, { status: 404 });
  }

  const targetUserId = toUserId ?? (lead as { manager_user_id?: string | null }).manager_user_id ?? "";
  if (!targetUserId) return NextResponse.json({ error: "알림 대상 담당자가 없습니다." }, { status: 400 });

  const customerNameRaw = String((lead as { name?: string | null }).name ?? "고객");
  const customerNameMasked =
    customerNameRaw.length >= 2 ? `${customerNameRaw[0]}${"*".repeat(Math.max(1, customerNameRaw.length - 1))}` : customerNameRaw;
  const carModel = String((lead as { car_model?: string | null }).car_model ?? "-");
  const source = String((lead as { source?: string | null }).source ?? "-");
  const aiLine = await generateAiOneLine({ name: customerNameRaw, carModel, source });

  const title = eventType === "new-lead-assigned" ? "📋 신규 디비가 배포되었습니다!" : "🔁 디비가 재배포되었습니다!";
  const message = `${customerNameMasked} / ${carModel} / ${source}`;

  const payload = {
    user_id: targetUserId,
    type: eventType,
    title,
    message,
    data: {
      leadId,
      customerNameMasked,
      carModel,
      source,
      assignedBy: auth.requester.name ?? "관리자",
      aiSummary: aiLine,
      eventType,
    },
  };

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from("notifications")
    .insert(payload)
    .select("id,user_id,type,title,message,data,is_read,created_at")
    .single();
  if (insErr) return NextResponse.json({ error: "알림 저장에 실패했습니다." }, { status: 500 });

  emitToUserRoom(targetUserId, REALTIME_EVENTS.NOTIFICATION, inserted);
  emitToUserRoom(
    targetUserId,
    eventType === "new-lead-assigned" ? REALTIME_EVENTS.NEW_LEAD_ASSIGNED : REALTIME_EVENTS.LEAD_REASSIGNED,
    inserted
  );

  return NextResponse.json({ ok: true, notification: inserted });
}
