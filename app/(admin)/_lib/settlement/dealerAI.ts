const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

export type ParsedDealerRow = {
  raw_text?: string;
  customer_name?: string;
  car_model?: string;
  owner_name?: string;
  dealer_commission?: number;
  contract_no?: string;
  settlement_date?: string;
  confidence: number;
};

function extractApiKey(): string {
  const apiKey =
    process.env.OPENAI_API_KEY?.trim() ||
    process.env.NOWAI_OPENAI_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OpenAI API 키 환경변수 없음 (OPENAI_API_KEY 확인 필요)");
  }
  return apiKey;
}

export async function parseImageWithVision(imageBase64: string, mimeType: string): Promise<ParsedDealerRow[]> {
  const apiKey = extractApiKey();
  const systemPrompt = `당신은 대한민국 자동차 금융 업계의 대리점 수당 명세서를 분석하는 전문가입니다.
주어진 이미지에서 다음 정보를 JSON 배열로 추출하세요:
[
  {
    "customer_name": "고객 이름",
    "car_model": "차종",
    "owner_name": "영업담당자 이름 (있으면)",
    "dealer_commission": 1500000,
    "contract_no": "계약번호 또는 관리번호",
    "settlement_date": "YYYY-MM-DD 정산일",
    "confidence": 0
  }
]
규칙:
- 금액은 반드시 원 단위 숫자만
- 한 장에 여러 건이면 배열로 여러 개 반환
- 알아볼 수 없는 필드는 null
- JSON만 반환, 설명 문구 금지`;

  const res = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      temperature: 0.1,
      max_tokens: 2000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: "이 대리점 수당 명세서에서 데이터를 추출해 JSON 배열로 반환하세요." },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI API 오류: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI 응답 비어있음");
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`AI 응답 JSON 파싱 실패: ${content.slice(0, 200)}`);
  }
  const obj = parsed as { data?: unknown[]; rows?: unknown[] } | unknown[];
  const arr = Array.isArray(obj) ? obj : obj.data ?? obj.rows ?? [];
  return arr.map((v) => {
    const row = v as Record<string, unknown>;
    return {
      raw_text: row.raw_text == null ? undefined : String(row.raw_text),
      customer_name: row.customer_name == null ? undefined : String(row.customer_name),
      car_model: row.car_model == null ? undefined : String(row.car_model),
      owner_name: row.owner_name == null ? undefined : String(row.owner_name),
      dealer_commission: row.dealer_commission == null ? undefined : Math.round(Number(row.dealer_commission) || 0),
      contract_no: row.contract_no == null ? undefined : String(row.contract_no),
      settlement_date: row.settlement_date == null ? undefined : String(row.settlement_date),
      confidence: Math.min(100, Math.max(0, Number(row.confidence ?? 50))),
    } satisfies ParsedDealerRow;
  });
}

export async function parseDealerExcel(buffer: ArrayBuffer): Promise<ParsedDealerRow[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });

  const HEADER_MAP: Record<string, keyof ParsedDealerRow> = {
    고객명: "customer_name",
    고객: "customer_name",
    차종: "car_model",
    차량: "car_model",
    담당자: "owner_name",
    영업사원: "owner_name",
    수당: "dealer_commission",
    수수료: "dealer_commission",
    금액: "dealer_commission",
    계약번호: "contract_no",
    관리번호: "contract_no",
    정산일: "settlement_date",
    지급일: "settlement_date",
  };

  return rows.map((row) => {
    const out: ParsedDealerRow = { confidence: 100 };
    for (const [key, value] of Object.entries(row)) {
      const target =
        HEADER_MAP[key] ??
        (Object.entries(HEADER_MAP).find(([k]) => key.includes(k))?.[1] as keyof ParsedDealerRow | undefined);
      if (!target) continue;
      if (target === "dealer_commission") {
        out.dealer_commission = Math.round(Number(String(value ?? "").replace(/,/g, "")) || 0);
      } else if (target === "confidence") {
        out.confidence = Number(value ?? 100);
      } else {
        (out[target] as unknown) = value == null ? undefined : String(value).trim();
      }
    }
    return out;
  });
}
