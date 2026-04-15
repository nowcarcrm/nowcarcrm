import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { runDailyAiBatch } from "@/app/_lib/aiBatchAnalysis";

const BodySchema = z
  .object({
    employeeId: z.string().uuid().optional(),
    forceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .optional();

export async function POST(req: Request) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.requester.role !== "admin" && auth.requester.role !== "super_admin") {
    return NextResponse.json({ error: "관리자만 수동 배치를 실행할 수 있습니다." }, { status: 403 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  try {
    const result = await runDailyAiBatch(parsed.data);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "배치 실행 실패";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
