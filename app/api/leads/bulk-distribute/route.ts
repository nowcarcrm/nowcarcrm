import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";
import { emitToUserRoom } from "@/app/_lib/socketGateway";
import { REALTIME_EVENTS } from "@/app/_lib/realtimeEvents";
import { isAdmin } from "@/app/(admin)/_lib/rolePermissions";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import {
  consultationSlotMemoLine,
  formatKoreanMobile,
  isValidKoreanMobile010,
  CONSULTATION_TIME_SLOT_VALUES,
} from "@/app/(admin)/_lib/bulkLeadPhone";

const LeadItemSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().min(1).max(30),
  desiredCar: z.string().max(500).optional().default(""),
  source: z.string().max(200).optional().default(""),
  managerUserId: z.string().uuid(),
  consultationTimeSlot: z
    .string()
    .max(20)
    .optional()
    .nullable()
    .transform((v) => (v && String(v).trim() ? String(v).trim() : null)),
  skipDuplicate: z.boolean().optional().default(false),
});

const BodySchema = z.object({
  leads: z.array(LeadItemSchema).min(1).max(200),
});

type InsertRow = {
  name: string;
  phone: string;
  car_model: string;
  source: string;
  status: string;
  sensitivity: string;
  manager: string;
  manager_user_id: string;
  memo: string | null;
  contract_period: string;
  review_status: string;
  consultation_time_slot: string | null;
  created_by: string;
  created_at: string;
};

export async function POST(req: Request) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) return NextResponse.json({ error: auth.error }, { status: auth.status });

  if (
    !isAdmin({
      id: auth.requester.id,
      role: auth.requester.role,
      rank: auth.requester.rank,
      email: auth.requester.email,
    })
  ) {
    return NextResponse.json({ error: "관리자만 접근할 수 있습니다." }, { status: 403 });
  }

  const rawJson = await req.json();
  const parsed = BodySchema.safeParse(rawJson);
  if (!parsed.success) {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const distributorId = auth.requester.id;
  const items = parsed.data.leads;
  if (items.some((i) => !i.name.trim())) {
    return NextResponse.json({ error: "고객명이 비어 있는 행이 있습니다." }, { status: 400 });
  }

  const managerIds = [...new Set(items.map((i) => i.managerUserId))];
  const { data: managers, error: mgrErr } = await supabaseAdmin
    .from("users")
    .select("id,name,rank")
    .in("id", managerIds);
  if (mgrErr || !managers || managers.length !== managerIds.length) {
    return NextResponse.json({ error: "담당 직원 정보를 확인할 수 없습니다." }, { status: 400 });
  }
  const managerMetaById = new Map<
    string,
    { displayName: string; name: string; rank: string }
  >();
  for (const u of managers as Array<{ id: string; name?: string | null; rank?: string | null }>) {
    const name = (u.name ?? "").trim() || "담당자";
    const rank = (u.rank ?? "").trim();
    const displayName = rank ? `${name} ${rank}` : name;
    managerMetaById.set(u.id, { displayName, name, rank });
  }

  const phonesToCheck = [
    ...new Set(
      items
        .map((i) => formatKoreanMobile(i.phone).trim())
        .filter((p) => isValidKoreanMobile010(p))
    ),
  ];
  const existingPhoneSet = new Set<string>();
  if (phonesToCheck.length > 0) {
    const { data: existRows, error: exErr } = await supabaseAdmin
      .from("leads")
      .select("phone")
      .in("phone", phonesToCheck);
    if (!exErr && existRows) {
      for (const r of existRows as Array<{ phone?: string | null }>) {
        const p = String(r.phone ?? "").trim();
        if (p) existingPhoneSet.add(p);
      }
    }
  }

  const batchIso = new Date().toISOString();
  const insertRows: InsertRow[] = [];
  const skippedDuplicates: string[] = [];

  for (const item of items) {
    const nameTrim = item.name.trim();
    if (!nameTrim) continue;

    const phone = formatKoreanMobile(item.phone).trim();
    if (!isValidKoreanMobile010(phone)) continue;

    const dup = existingPhoneSet.has(phone);
    if (dup && item.skipDuplicate) {
      skippedDuplicates.push(phone);
      continue;
    }

    const slot = item.consultationTimeSlot;
    const slotOk =
      slot &&
      (CONSULTATION_TIME_SLOT_VALUES as readonly string[]).includes(slot) ? slot : null;
    const memoLine = consultationSlotMemoLine(slotOk ?? "");
    const memo = memoLine ?? null;

    const mgrName = managerMetaById.get(item.managerUserId)?.displayName ?? "담당자";
    insertRows.push({
      name: nameTrim.slice(0, 200),
      phone,
      car_model: (item.desiredCar ?? "").trim().slice(0, 500),
      source: (item.source ?? "").trim().slice(0, 200),
      status: "신규",
      sensitivity: "중",
      manager: mgrName,
      manager_user_id: item.managerUserId,
      memo,
      contract_period: "36개월",
      review_status: "심사 전",
      consultation_time_slot: slotOk,
      created_by: distributorId,
      created_at: batchIso,
    });
  }

  if (insertRows.length === 0) {
    return NextResponse.json({
      success: true,
      distributedCount: 0,
      perUser: {} as Record<string, { name: string; rank: string; count: number }>,
      skippedDuplicates,
    });
  }

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from("leads")
    .insert(insertRows)
    .select("id,manager_user_id");
  if (insErr || !inserted) {
    return NextResponse.json(
      { error: insErr?.message ?? "고객 일괄 등록에 실패했습니다." },
      { status: 500 }
    );
  }

  const perUser: Record<string, { name: string; rank: string; count: number }> = {};
  for (const row of inserted as Array<{ manager_user_id?: string | null }>) {
    const uid = String(row.manager_user_id ?? "").trim();
    if (!uid) continue;
    const meta = managerMetaById.get(uid);
    const name = meta?.name ?? "담당자";
    const rank = meta?.rank ?? "";
    if (!perUser[uid]) perUser[uid] = { name, rank, count: 0 };
    perUser[uid].count += 1;
  }

  for (const [userId, { name, count }] of Object.entries(perUser)) {
    if (count <= 0) continue;
    const title = "📋 대량 디비 배포";
    const message = `[${count}명]의 새 고객이 배정되었습니다`;
    const { data: notif, error: nErr } = await supabaseAdmin
      .from("notifications")
      .insert({
        user_id: userId,
        type: "bulk-new-leads",
        title,
        message,
        data: {
          count,
          distributorId,
          distributorName: auth.requester.name ?? "관리자",
        },
      })
      .select("id,user_id,type,title,message,data,is_read,created_at")
      .single();
    if (!nErr && notif) {
      emitToUserRoom(userId, REALTIME_EVENTS.NOTIFICATION, notif);
    }
  }

  try {
    await supabaseAdmin.from("bulk_lead_distribution_logs").insert({
      distributed_by: distributorId,
      total_count: inserted.length,
      distributed_at: batchIso,
      details: {
        perUser,
        skippedDuplicates,
        leadIds: (inserted as Array<{ id: string }>).map((r) => r.id),
      },
    });
  } catch {
    // 로그 실패는 배포 결과에 영향 없음
  }

  return NextResponse.json({
    success: true,
    distributedCount: inserted.length,
    perUser,
    skippedDuplicates,
  });
}
