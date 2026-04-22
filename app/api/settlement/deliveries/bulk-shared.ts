import * as XLSX from "xlsx";
import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";
import { canAssignOwner, ensureOwnerTemplate, normalizeMoney, toDeliveryRow, type Requester } from "./_lib";
import type { DeliveryCreateInput } from "@/app/(admin)/_types/settlement";

export const BULK_HEADERS = [
  "담당자이메일",
  "계약일자",
  "인도일자*",
  "차량등록일자",
  "고객명*",
  "차종*",
  "차량가*",
  "금융사*",
  "상품유형*",
  "출고방식*",
  "대리점명",
  "대리점계약번호",
  "AG수수료*",
  "고객지원금",
  "기타수익",
  "특이사항",
] as const;

export const FINANCE_COMPANIES = [
  "현대캐피탈",
  "KB캐피탈",
  "신한캐피탈",
  "하나캐피탈",
  "우리캐피탈",
  "기아캐피탈",
  "롯데캐피탈",
  "NH캐피탈",
  "JB우리캐피탈",
  "BNK캐피탈",
  "기타",
] as const;

type ParsedBulkInput = {
  row_index: number;
  owner_id: string;
  owner_name: string;
  owner_email: string;
  team_name: string | null;
  contract_date: string | null;
  delivery_date: string;
  registration_date: string | null;
  customer_name: string;
  car_model: string;
  car_price: number;
  financial_company: string;
  product_type: "rent" | "lease";
  delivery_type: "special" | "dealer";
  dealer_name: string | null;
  dealer_contract_no: string | null;
  ag_commission: number;
  customer_support: number;
  etc_revenue: number;
  notes: string | null;
};

export type BulkParseRowResult = {
  row_index: number;
  status: "valid" | "invalid";
  errors: string[];
  parsed?: ParsedBulkInput;
};

function toTrimmed(v: unknown): string {
  return String(v ?? "").trim();
}

function parseDateCell(value: unknown): string {
  const raw = toTrimmed(value);
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (typeof value === "number") {
    const date = XLSX.SSF.parse_date_code(value);
    if (date && date.y && date.m && date.d) {
      return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
    }
  }
  return raw;
}

function mapProductType(v: string): "rent" | "lease" | null {
  if (v === "장기렌트") return "rent";
  if (v === "리스") return "lease";
  return null;
}

function mapDeliveryType(v: string): "special" | "dealer" | null {
  if (v === "특판") return "special";
  if (v === "대리점") return "dealer";
  return null;
}

export function parseBulkWorkbook(buffer: ArrayBuffer): Record<string, unknown>[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const firstSheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: "" });
}

export async function validateBulkRows(rawRows: Record<string, unknown>[], requester: Requester): Promise<BulkParseRowResult[]> {
  const emails = Array.from(new Set(rawRows.map((r) => toTrimmed(r["담당자이메일"])).filter(Boolean)));
  const { data: users } = emails.length
    ? await supabaseAdmin.from("users").select("id,name,email,team_name").in("email", emails)
    : { data: [] as Array<{ id: string; name: string | null; email: string | null; team_name: string | null }> };
  const userByEmail = new Map((users ?? []).map((u) => [toTrimmed(u.email), u]));

  const templateUsers = Array.from(new Set((users ?? []).map((u) => u.id)));
  const { data: templates } = templateUsers.length
    ? await supabaseAdmin.from("settlement_rate_templates").select("user_id").in("user_id", templateUsers)
    : { data: [] as Array<{ user_id: string }> };
  const templateUserIds = new Set((templates ?? []).map((t) => t.user_id));

  const results: BulkParseRowResult[] = [];
  for (let i = 0; i < rawRows.length; i += 1) {
    const row = rawRows[i];
    const rowIndex = i + 2;
    const errors: string[] = [];
    const ownerEmail = toTrimmed(row["담당자이메일"]);
    const owner = userByEmail.get(ownerEmail);
    if (!ownerEmail) errors.push("담당자이메일이 비어 있습니다.");
    if (ownerEmail && !owner) errors.push(`담당자이메일 '${ownerEmail}'를 찾을 수 없음`);
    if (owner && !templateUserIds.has(owner.id)) errors.push(`담당자이메일 '${ownerEmail}'은 정산 요율 템플릿이 없습니다.`);
    if (owner && !canAssignOwner(requester, owner.team_name, owner.id)) {
      errors.push(`권한으로 담당자(${ownerEmail}) 등록 불가`);
    }

    const deliveryDate = parseDateCell(row["인도일자*"]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) {
      errors.push(`인도일자 형식 오류: '${toTrimmed(row["인도일자*"])}' (YYYY-MM-DD 필요)`);
    }

    const customerName = toTrimmed(row["고객명*"]);
    const carModel = toTrimmed(row["차종*"]);
    const financialCompany = toTrimmed(row["금융사*"]);
    if (!customerName) errors.push("고객명*은 필수입니다.");
    if (!carModel) errors.push("차종*은 필수입니다.");
    if (!financialCompany) errors.push("금융사*는 필수입니다.");
    if (financialCompany && !FINANCE_COMPANIES.includes(financialCompany as (typeof FINANCE_COMPANIES)[number])) {
      errors.push(`금융사 '${financialCompany}'는 허용되지 않음`);
    }

    const productTypeRaw = toTrimmed(row["상품유형*"]);
    const deliveryTypeRaw = toTrimmed(row["출고방식*"]);
    const productType = mapProductType(productTypeRaw);
    const deliveryType = mapDeliveryType(deliveryTypeRaw);
    if (!productType) errors.push(`상품유형 '${productTypeRaw}'는 허용되지 않음 (장기렌트/리스만)`);
    if (!deliveryType) errors.push(`출고방식 '${deliveryTypeRaw}'는 허용되지 않음 (특판/대리점만)`);

    const carPrice = normalizeMoney(String(row["차량가*"]).replace(/,/g, ""));
    const agCommission = normalizeMoney(String(row["AG수수료*"]).replace(/,/g, ""));
    const customerSupport = normalizeMoney(String(row["고객지원금"]).replace(/,/g, ""));
    const etcRevenue = normalizeMoney(String(row["기타수익"]).replace(/,/g, ""));

    if (errors.length > 0 || !owner || !productType || !deliveryType) {
      results.push({ row_index: rowIndex, status: "invalid", errors });
      continue;
    }

    results.push({
      row_index: rowIndex,
      status: "valid",
      errors: [],
      parsed: {
        row_index: rowIndex,
        owner_id: owner.id,
        owner_name: toTrimmed(owner.name),
        owner_email: ownerEmail,
        team_name: owner.team_name,
        contract_date: parseDateCell(row["계약일자"]) || null,
        delivery_date: deliveryDate,
        registration_date: parseDateCell(row["차량등록일자"]) || null,
        customer_name: customerName,
        car_model: carModel,
        car_price: carPrice,
        financial_company: financialCompany,
        product_type: productType,
        delivery_type: deliveryType,
        dealer_name: toTrimmed(row["대리점명"]) || null,
        dealer_contract_no: toTrimmed(row["대리점계약번호"]) || null,
        ag_commission: agCommission,
        customer_support: customerSupport,
        etc_revenue: etcRevenue,
        notes: toTrimmed(row["특이사항"]) || null,
      },
    });
  }
  return results;
}

export function toCreateInput(parsed: ParsedBulkInput): DeliveryCreateInput {
  return {
    owner_id: parsed.owner_id,
    contract_date: parsed.contract_date,
    delivery_date: parsed.delivery_date,
    registration_date: parsed.registration_date,
    customer_name: parsed.customer_name,
    car_model: parsed.car_model,
    car_price: parsed.car_price,
    financial_company: parsed.financial_company,
    product_type: parsed.product_type,
    delivery_type: parsed.delivery_type,
    dealer_name: parsed.dealer_name,
    dealer_contract_no: parsed.dealer_contract_no,
    ag_commission: parsed.ag_commission,
    customer_support: parsed.customer_support,
    etc_revenue: parsed.etc_revenue,
    notes: parsed.notes,
  };
}

export async function prepareInsertPayload(parsed: ParsedBulkInput, requesterId: string) {
  const template = await ensureOwnerTemplate(parsed.owner_id);
  if (!template) throw new Error("정산 대상자가 아닙니다. 요율 템플릿을 먼저 등록하세요.");
  const row = toDeliveryRow(toCreateInput(parsed));
  return {
    payload: {
      ...row,
      owner_id: parsed.owner_id,
      created_by: requesterId,
      team_name: parsed.team_name,
      status: "draft",
      version: 1,
      dealer_settlement_month: null,
      dealer_commission: null,
    },
    warning: template.is_excluded ? "정산 제외 대상자에게 등록되었습니다." : undefined,
  };
}
