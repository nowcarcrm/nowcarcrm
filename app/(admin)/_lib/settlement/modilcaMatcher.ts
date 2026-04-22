import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";
import type { ModilcaRow } from "./modilcaParser";

export type ModilcaMatchResult = {
  row: ModilcaRow;
  matched: boolean;
  delivery_id?: string;
  match_reason?: string;
};

type DeliveryCandidate = {
  id: string;
  customer_name: string;
  car_model: string;
  dealer_contract_no: string | null;
};

export async function matchModilcaRows(rows: ModilcaRow[]): Promise<ModilcaMatchResult[]> {
  const results: ModilcaMatchResult[] = [];
  for (const row of rows) {
    const result: ModilcaMatchResult = { row, matched: false };
    if (row.mapped.dealer_contract_no) {
      const { data } = await supabaseAdmin
        .from("settlement_deliveries")
        .select("id,customer_name,car_model,dealer_contract_no")
        .eq("dealer_contract_no", row.mapped.dealer_contract_no)
        .in("status", ["approved_director", "modilca_submitted"])
        .is("deleted_at", null)
        .maybeSingle();
      if (data) {
        result.matched = true;
        result.delivery_id = String((data as DeliveryCandidate).id);
        result.match_reason = "계약번호 일치";
      }
    }
    if (!result.matched && row.mapped.customer_name && row.mapped.car_model) {
      const { data } = await supabaseAdmin
        .from("settlement_deliveries")
        .select("id,customer_name,car_model,dealer_contract_no")
        .ilike("customer_name", row.mapped.customer_name)
        .ilike("car_model", `%${row.mapped.car_model}%`)
        .in("status", ["approved_director", "modilca_submitted"])
        .is("deleted_at", null);
      const list = (data ?? []) as DeliveryCandidate[];
      if (list.length === 1) {
        result.matched = true;
        result.delivery_id = list[0].id;
        result.match_reason = "고객명+차종 일치";
      }
    }
    results.push(result);
  }
  return results;
}
