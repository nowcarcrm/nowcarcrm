import { supabaseAdmin } from "@/app/_lib/supabaseAdminServer";
import type { ParsedDealerRow } from "./dealerAI";

export type DealerMatchResult = {
  parsed: ParsedDealerRow;
  match_tier: 1 | 2 | 3 | 4 | 0;
  confidence: number;
  delivery_id?: string;
  delivery_summary?: string;
  match_reason?: string;
};

type Candidate = {
  id: string;
  customer_name: string;
  car_model: string;
  dealer_contract_no: string | null;
  owner_name: string;
};

function levenshteinRatio(a: string, b: string): number {
  if (!a || !b) return 0;
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) matrix[i][j] = matrix[i - 1][j - 1];
      else matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  return 1 - matrix[b.length][a.length] / Math.max(a.length, b.length);
}

export async function matchDealerRows(
  rows: ParsedDealerRow[],
  candidateStatuses: string[] = ["approved_director", "modilca_submitted", "confirmed"]
): Promise<DealerMatchResult[]> {
  const { data: candidates } = await supabaseAdmin
    .from("settlement_deliveries")
    .select("id,owner_id,customer_name,car_model,dealer_contract_no,owner:users!owner_id(name)")
    .in("status", candidateStatuses)
    .is("dealer_commission", null)
    .is("deleted_at", null);
  const candidateList: Candidate[] = ((candidates ?? []) as Array<Record<string, unknown>>).map((c) => ({
    id: String(c.id),
    customer_name: String(c.customer_name ?? ""),
    car_model: String(c.car_model ?? ""),
    dealer_contract_no: c.dealer_contract_no == null ? null : String(c.dealer_contract_no),
    owner_name: String((c.owner as { name?: string } | null)?.name ?? ""),
  }));

  const results: DealerMatchResult[] = [];
  for (const parsed of rows) {
    const base: DealerMatchResult = { parsed, match_tier: 0, confidence: 0 };

    if (parsed.contract_no) {
      const match = candidateList.find((c) => c.dealer_contract_no && c.dealer_contract_no === parsed.contract_no);
      if (match) {
        results.push({
          ...base,
          match_tier: 1,
          confidence: 100 * (parsed.confidence / 100),
          delivery_id: match.id,
          delivery_summary: `${match.customer_name} / ${match.car_model} / ${match.owner_name}`,
          match_reason: "계약번호 일치",
        });
        continue;
      }
    }

    if (parsed.customer_name && parsed.owner_name) {
      const match = candidateList.find((c) => c.customer_name === parsed.customer_name && c.owner_name === parsed.owner_name);
      if (match) {
        results.push({
          ...base,
          match_tier: 2,
          confidence: Math.round(90 * (parsed.confidence / 100)),
          delivery_id: match.id,
          delivery_summary: `${match.customer_name} / ${match.car_model} / ${match.owner_name}`,
          match_reason: "고객명+담당자 일치",
        });
        continue;
      }
    }

    if (parsed.owner_name && parsed.car_model) {
      const match = candidateList.find(
        (c) =>
          c.owner_name === parsed.owner_name &&
          (c.car_model.includes(parsed.car_model ?? "") || (parsed.car_model ?? "").includes(c.car_model))
      );
      if (match) {
        results.push({
          ...base,
          match_tier: 3,
          confidence: Math.round(80 * (parsed.confidence / 100)),
          delivery_id: match.id,
          delivery_summary: `${match.customer_name} / ${match.car_model} / ${match.owner_name}`,
          match_reason: "담당자+차종 일치",
        });
        continue;
      }
    }

    if (parsed.customer_name) {
      const scored = candidateList
        .map((candidate) => ({
          candidate,
          score: levenshteinRatio(candidate.customer_name, parsed.customer_name ?? ""),
        }))
        .filter((v) => v.score >= 0.8)
        .sort((a, b) => b.score - a.score);
      if (scored.length === 1 || (scored.length > 1 && scored[0].score - scored[1].score >= 0.1)) {
        const match = scored[0].candidate;
        results.push({
          ...base,
          match_tier: 4,
          confidence: Math.round(scored[0].score * 70 * (parsed.confidence / 100)),
          delivery_id: match.id,
          delivery_summary: `${match.customer_name} / ${match.car_model} / ${match.owner_name}`,
          match_reason: `고객명 유사도 ${Math.round(scored[0].score * 100)}%`,
        });
        continue;
      }
    }

    results.push(base);
  }
  return results;
}
