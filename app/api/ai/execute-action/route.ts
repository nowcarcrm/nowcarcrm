import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";

const ActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("update_lead"),
    field: z.enum(["status", "memo", "sensitivity", "priority"]),
    value: z.string().min(1),
    mode: z.enum(["replace", "append"]).optional(),
  }),
  z.object({
    type: z.literal("add_consultation"),
    payload: z.object({
      memo: z.string().min(1),
      reaction: z.string().optional(),
      method: z.string().optional(),
      nextContactMemo: z.string().optional(),
    }),
  }),
]);

const RequestSchema = z.object({
  leadId: z.string().uuid(),
  actions: z.array(ActionSchema).min(1).max(10),
});

export async function POST(req: Request) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  try {
    const parsed = RequestSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ ok: false, error: "요청 형식이 올바르지 않습니다." }, { status: 400 });

    const { leadId, actions } = parsed.data;
    let leadQuery = supabaseAdmin.from("leads").select("id,manager_user_id,memo,status,sensitivity").eq("id", leadId);
    if (auth.requester.role !== "admin" && auth.requester.role !== "super_admin") {
      leadQuery = leadQuery.eq("manager_user_id", auth.requester.id);
    }
    const { data: lead, error: leadError } = await leadQuery.maybeSingle();
    if (leadError) return NextResponse.json({ ok: false, error: "고객 조회에 실패했습니다." }, { status: 500 });
    if (!lead) return NextResponse.json({ ok: false, error: "고객 접근 권한이 없거나 찾을 수 없습니다." }, { status: 403 });

    const results: Array<{ action: unknown; ok: boolean; message: string }> = [];
    for (const action of actions) {
      if (action.type === "update_lead") {
        if (!["status", "memo", "sensitivity", "priority"].includes(action.field)) {
          results.push({ action, ok: false, message: "허용되지 않은 필드입니다." });
          continue;
        }
        if (action.field === "priority") {
          const baseMemo = (lead.memo ?? "").trim();
          const nextMemo = `${baseMemo}${baseMemo ? "\n" : ""}[AI 우선순위] ${action.value}`.slice(0, 4000);
          const { error } = await supabaseAdmin.from("leads").update({ memo: nextMemo }).eq("id", leadId);
          results.push({
            action,
            ok: !error,
            message: error ? "❌ 우선순위 기록에 실패했습니다." : `✅ 우선순위를 '${action.value}'로 기록했습니다.`,
          });
          continue;
        }

        const value =
          action.field === "memo" && action.mode === "append"
            ? `${(lead.memo ?? "").trim()}${(lead.memo ?? "").trim() ? "\n" : ""}${action.value}`.slice(0, 4000)
            : action.value;
        const payload = { [action.field]: value } as Record<string, string>;
        const { error } = await supabaseAdmin.from("leads").update(payload).eq("id", leadId);
        results.push({
          action,
          ok: !error,
          message: error ? `❌ ${action.field} 변경에 실패했습니다.` : `✅ ${action.field} 변경이 완료됐습니다.`,
        });
        continue;
      }

      if (action.type === "add_consultation") {
        const nowIso = new Date().toISOString();
        const { error } = await supabaseAdmin.from("consultations").insert({
          lead_id: leadId,
          counselor: auth.requester.name ?? "담당자",
          method: action.payload.method ?? "전화",
          importance: "보통",
          reaction: action.payload.reaction ?? "",
          desired_progress_at: nowIso,
          next_action_at: null,
          next_contact_memo: action.payload.nextContactMemo ?? null,
          memo: action.payload.memo,
        });
        results.push({
          action,
          ok: !error,
          message: error ? "❌ 상담기록 추가에 실패했습니다." : "✅ 상담기록을 추가했습니다.",
        });
      }
    }

    const success = results.every((result) => result.ok);
    await supabaseAdmin.from("ai_action_logs").insert({
      employee_id: auth.requester.id,
      lead_id: leadId,
      actions,
      results,
      success,
    });

    return NextResponse.json({ ok: true, success, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "서버 오류";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
