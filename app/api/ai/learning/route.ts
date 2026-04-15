import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";

const LearningTypeSchema = z.enum([
  "preferred_style",
  "successful_ment",
  "rejected_ment",
  "feedback",
  "consultation_pattern",
]);

const PostSchema = z.object({
  employeeId: z.string().uuid(),
  learningType: LearningTypeSchema,
  content: z.string().min(1).max(5000),
});

const GetQuerySchema = z.object({
  employeeId: z.string().uuid(),
});

export async function POST(req: Request) {
  try {
    const parsed = PostSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
    }

    const { employeeId, learningType, content } = parsed.data;
    const { data, error } = await supabaseAdmin
      .from("ai_employee_learnings")
      .insert({
        employee_id: employeeId,
        learning_type: learningType,
        content: content.trim(),
      })
      .select("id, employee_id, learning_type, content, created_at")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, item: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "서버 오류";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = GetQuerySchema.safeParse({
      employeeId: url.searchParams.get("employeeId") ?? "",
    });

    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "employeeId가 올바르지 않습니다." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("ai_employee_learnings")
      .select("id, employee_id, learning_type, content, created_at")
      .eq("employee_id", parsed.data.employeeId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, items: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "서버 오류";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
