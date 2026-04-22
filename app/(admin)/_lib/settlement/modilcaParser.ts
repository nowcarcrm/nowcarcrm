import * as XLSX from "xlsx";

export type ModilcaMapped = {
  dealer_contract_no?: string;
  customer_name?: string;
  car_model?: string;
  ag_commission?: number;
  delivery_date?: string;
};

export type ModilcaRow = {
  row_index: number;
  raw: Record<string, unknown>;
  mapped: ModilcaMapped;
};

export type ColumnMapping = Record<string, string>;

export function parseModilcaExcel(buffer: ArrayBuffer): Record<string, unknown>[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const firstSheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
}

function normalizeDate(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "number") {
    const date = XLSX.SSF.parse_date_code(value);
    if (!date || !date.y || !date.m || !date.d) return undefined;
    return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
  }
  const str = String(value).trim();
  const match = str.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (!match) return undefined;
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

export function applyColumnMapping(rows: Record<string, unknown>[], mapping: ColumnMapping): ModilcaRow[] {
  return rows.map((raw, idx) => {
    const mapped: ModilcaMapped = {};
    for (const [sourceCol, targetField] of Object.entries(mapping)) {
      const value = raw[sourceCol];
      if (value == null || targetField === "__ignore__") continue;
      if (targetField === "ag_commission") {
        mapped.ag_commission = Math.round(Number(String(value).replace(/,/g, "")) || 0);
      } else if (targetField === "delivery_date") {
        mapped.delivery_date = normalizeDate(value);
      } else if (targetField === "dealer_contract_no") {
        mapped.dealer_contract_no = String(value).trim();
      } else if (targetField === "customer_name") {
        mapped.customer_name = String(value).trim();
      } else if (targetField === "car_model") {
        mapped.car_model = String(value).trim();
      }
    }
    return { row_index: idx + 2, raw, mapped };
  });
}
