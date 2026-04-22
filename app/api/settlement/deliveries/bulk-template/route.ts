import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getRequesterFromToken } from "@/app/api/notifications/_lib";
import { isSettlementManager } from "@/app/(admin)/_lib/settlement/permissions";
import { BULK_HEADERS } from "../bulk-shared";

export async function GET(req: Request) {
  const auth = await getRequesterFromToken(req);
  if (!auth.requester) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isSettlementManager(auth.requester)) return NextResponse.json({ error: "팀장 이상만 접근할 수 있습니다." }, { status: 403 });

  const wb = XLSX.utils.book_new();
  const inputSheet = XLSX.utils.aoa_to_sheet([BULK_HEADERS as unknown as string[]]);
  inputSheet["!cols"] = BULK_HEADERS.map(() => ({ wch: 18 }));
  XLSX.utils.book_append_sheet(wb, inputSheet, "출고 입력");

  const guideRows = [
    ["필드명", "설명", "예시"],
    ["담당자이메일", "등록된 직원 이메일", "abc@nowcar.co.kr"],
    ["인도일자", "날짜 (YYYY-MM-DD)", "2026-04-20"],
    ["금융사", "드롭다운 목록 중 선택", "현대캐피탈"],
    ["상품유형", '"장기렌트" 또는 "리스"', "장기렌트"],
    ["출고방식", '"특판" 또는 "대리점"', "특판"],
    ["차량가/수수료 등", "숫자만 (콤마 허용)", "25,000,000"],
  ];
  const guideSheet = XLSX.utils.aoa_to_sheet(guideRows);
  guideSheet["!cols"] = [{ wch: 22 }, { wch: 38 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, guideSheet, "작성 가이드");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent("출고_일괄등록_템플릿.xlsx")}`,
      "Cache-Control": "no-store",
    },
  });
}
