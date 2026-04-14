import { NextResponse } from "next/server";
import { z } from "zod";
import {
  COUNSEL_ASSIST_MESSAGE_TONES,
  type CounselAssistContextPayload,
  type CounselAssistResult,
} from "@/app/(admin)/_lib/counselAssistShared";
import { supabaseAdmin, supabaseAuthVerifier } from "@/app/_lib/supabaseAdminServer";

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

async function getRequester(authUserId: string) {
  const { data: byId, error: e1 } = await supabaseAdmin
    .from("users")
    .select("id, role, approval_status")
    .eq("id", authUserId)
    .maybeSingle();
  if (e1) return { row: null, error: e1 };
  if (byId) return { row: byId, error: null };
  const { data: legacy, error: e2 } = await supabaseAdmin
    .from("users")
    .select("id, role, approval_status")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  return { row: legacy, error: e2 };
}

const toneEnum = COUNSEL_ASSIST_MESSAGE_TONES as unknown as [string, ...string[]];

const CounselAssistResultSchema = z.object({
  summary: z.array(z.string()).min(3).max(5),
  customerStage: z.string().min(1),
  purchaseIntentScore: z.number().int().min(0).max(100),
  priceSensitivityScore: z.number().int().min(0).max(100),
  responseRiskScore: z.number().int().min(0).max(100),
  riskSignals: z.array(z.string()).min(1).max(12),
  recommendedAction: z.string().min(1),
  recommendedActions: z.array(z.string()).min(2).max(5),
  messageSuggestions: z
    .array(
      z.object({
        tone: z.enum(toneEnum),
        text: z.string().min(1),
      })
    )
    .length(3),
});

const RequestSchema = z.object({
  context: z.record(z.string(), z.unknown()),
});

function developerPrompt(): string {
  return [
    "You are a senior coach for Korean automotive long-term rent and operating/finance lease sales teams.",
    "Input is a JSON snapshot of one CRM lead: profile, counseling logs, quotes, contract/export hints.",
    "Output MUST be a single JSON object matching the provided schema. All user-facing strings in Korean.",
    "Goals: honest conversion, actionable next steps, three copy-paste Kakao/SMS-ready messages.",
    "Strict prohibitions:",
    "- No underwriting approval guarantees, no false discounts, no unverified lowest-price claims.",
    "- No legal promises; use conditional wording (terms depend on finance company rules).",
    "- Do not invent facts not supported by the snapshot; if data is thin, say so briefly.",
    "Scores are heuristic 0-100 integers, not guarantees.",
    "customerStage: one short Korean phrase (comparison stage, price sensitivity, slow reply, etc.).",
    "riskSignals: short Korean tags (price sensitivity, delayed response, credit anxiety, etc.).",
    "recommendedAction: one decisive sentence. recommendedActions: 2-5 concrete bullets for the rep.",
    "summary: 3-5 items, each 1-2 sentences, recent counseling essence.",
    "messageSuggestions: exactly three items; tones MUST be exactly these Korean labels:",
    `"${COUNSEL_ASSIST_MESSAGE_TONES[0]}", "${COUNSEL_ASSIST_MESSAGE_TONES[1]}", "${COUNSEL_ASSIST_MESSAGE_TONES[2]}"`,
    "Each message: natural Korean, not robotic, max 2-5 short sentences, ready to send.",
    "Output JSON only, no markdown.",
  ].join("\n");
}

function fallbackResult(): CounselAssistResult {
  return {
    summary: [
      "\uc0c1\ub2f4 \uae30\ub85d\uc744 \ucda9\ubd84\ud788 \ubd84\uc11d\ud558\uc9c0 \ubabb\ud588\uac70\ub098 AI \uc751\ub2f5\uc774 \uc2e4\ud328\ud588\uc2b5\ub2c8\ub2e4.",
      "\uace0\uac1d\ub2d8 \uad00\uc2ec \ucc28\uc885\uacfc \uc6d4\ub0a9/\ucd08\uae30\ube44\uc6a9 \ubd80\ub2f4\uc744 \ud55c \ubc88 \ub354 \ud655\uc778\ud558\ub294 \uac83\uc774 \uc88b\uc2b5\ub2c8\ub2e4.",
      "\ub2e4\uc74c \uc5f0\ub77d \uc77c\uc815\uc774 \uc788\ub2e4\uba74 \uadf8 \uc804\uc5d0 \uc870\uac74\ud45c\ub97c \uc815\ub9ac\ud574 \ub450\uba74 \uc7ac\uc5f0\ub77d\uc774 \uc218\uc6d4\ud569\ub2c8\ub2e4.",
    ],
    customerStage: "\uc815\ubcf4 \ubd80\uc871 \xb7 \uc7ac\ud655\uc778 \ud544\uc694",
    purchaseIntentScore: 50,
    priceSensitivityScore: 50,
    responseRiskScore: 50,
    riskSignals: ["\ub370\uc774\ud130 \ubd80\uc871"],
    recommendedAction:
      "\uace0\uac1d\ub2d8 \uad00\uc2ec \ucc28\uc885\uacfc \uc6d4 \ub0a9\uc785 \uc5ec\uc5c0\uc744 \ud655\uc778\ud55c \ub4a4 \uc624\ub298 \uc911 \uc7ac\uc5f0\ub77d\uc744 \uc81c\uc548\ud558\uc138\uc694.",
    recommendedActions: [
      "\ucd5c\uadfc \uc0c1\ub2f4 \ub0b4\uc6a93\uac00\uc9c0\ub9cc \ucc99\uc5d0 \uc815\ub9ac\ud574 \uacf5\uc720",
      "\uc870\uac74\ud45c(\uc6d4\ub0a9/\ubcf4\uc99d\uae08)\ub97c \ud604\uc2e4 \uae30\uc900\uc73c\ub85c \uc7ac\uc804\uc1a1",
      "\ub2e4\uc74c \uc5f0\ub77d \uc77c\uc815\uc744 \uc7a1\uace0 \uce74\ud1a1\uc73c\ub85c \uc55e\uc7a5\uc11c \uc548\ub0b4",
    ],
    messageSuggestions: [
      {
        tone: COUNSEL_ASSIST_MESSAGE_TONES[0],
        text: "\uc548\ub155\ud558\uc138\uc694, \uc5b4\uc81c \ub9d0\uc500\ub4dc\ub9b0 \uc870\uac74 \uae30\uc900\uc73c\ub85c \ubd80\ub2f4\uc744 \uc870\uae08 \ub354 \ub098\ub204\uc5b4 \ubcf4\ub824\uace0 \ud569\ub2c8\ub2e4. \uc2dc\uac04 \ub418\uc2e4 \ub54c \uc5f0\ub77d \uc8fc\uc2dc\uba74 \uc0c8 \uc218\uce58\ub85c \ub9de\ucda4 \uc548\ub0b4\ub4dc\ub9b4\uac8c\uc694.",
      },
      {
        tone: COUNSEL_ASSIST_MESSAGE_TONES[1],
        text: "\uc800\ud76c\ub294 \uacc4\uc57d \uc804 \uc870\uac74\uacfc \uc9c4\ud589 \uc77c\uc815\uc744 \ud22c\uba85\ud558\uac8c \uc548\ub0b4\ub4dc\ub9ac\uace0 \uc788\uc2b5\ub2c8\ub2e4. \uaf2d \ube44\uad50\ud574 \ubcf4\uc2dc\uace0 \uaf2d \ub354 \ub098\uc740 \uc548\uc744 \ucc3e\uc544\ubcf4\uaca0\uc2b5\ub2c8\ub2e4.",
      },
      {
        tone: COUNSEL_ASSIST_MESSAGE_TONES[2],
        text: "\uc624\ub298 \uc911\uc5d0 \uc870\uac74\uc774 \ub9de\uc73c\uc2dc\uba74 \ubc1c\uc1a1 \uac00\ub2a5 \uc2dc\uae30\ub3c4 \uc5f0\ub3d9\ud574 \ubcf4\uaca0\uc2b5\ub2c8\ub2e4. \uc7a0\uc2dc \uc804\ud654 \ub610\ub294 \uce74\ud1a1 \uc8fc\uc2dc\uba74 \ubc14\ub85c \uc815\ub9ac\ud574 \ub4dc\ub9b4\uac8c\uc694.",
      },
    ],
  };
}

function parseModelJson(raw: string): CounselAssistResult {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return CounselAssistResultSchema.parse(parsed) as CounselAssistResult;
  } catch (e) {
    console.error("[counsel-assist] parse/validate failed", e);
    return fallbackResult();
  }
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: "\uc778\uc99d \ud1a0\ud070\uc774 \uc5c6\uc2b5\ub2c8\ub2e4." }, { status: 401 });
    }

    const { data: authData, error: authErr } = await supabaseAuthVerifier.auth.getUser(token);
    if (authErr || !authData.user) {
      return NextResponse.json({ error: "\uc720\ud6a8\ud558\uc9c0 \uc54a\uc740 \uc778\uc99d\uc785\ub2c8\ub2e4." }, { status: 401 });
    }

    const { row: requester, error: requesterErr } = await getRequester(authData.user.id);
    if (requesterErr || !requester) {
      return NextResponse.json({ error: "\uc9c1\uc6d0 \uacc4\uc815 \ud655\uc778\uc5d0 \uc2e4\ud328\ud588\uc2b5\ub2c8\ub2e4." }, { status: 403 });
    }
    const approved = requester.approval_status === "approved";
    const role = requester.role;
    if (!approved || (role !== "admin" && role !== "manager" && role !== "staff")) {
      return NextResponse.json({ error: "\uc811\uadfc \uad8c\ud55c\uc774 \uc5c6\uc2b5\ub2c8\ub2e4." }, { status: 403 });
    }

    const bodyRaw = await req.json();
    const parsed = RequestSchema.safeParse(bodyRaw);
    if (!parsed.success) {
      return NextResponse.json({ error: "context \ud544\ub4dc\uac00 \uc5c6\uc2b5\ub2c8\ub2e4." }, { status: 400 });
    }

    const context = parsed.data.context as CounselAssistContextPayload;
    const leadId = typeof context.leadId === "string" ? context.leadId.trim() : "";
    if (!leadId) {
      return NextResponse.json({ error: "leadId\uac00 \uc5c6\uc2b5\ub2c8\ub2e4." }, { status: 400 });
    }

    const { data: leadRow, error: leadErr } = await supabaseAdmin
      .from("leads")
      .select("id, manager_user_id")
      .eq("id", leadId)
      .maybeSingle();

    if (leadErr) {
      console.error("[counsel-assist] lead lookup", leadErr);
      return NextResponse.json({ error: "\uace0\uac1d \uc870\ud68c\uc5d0 \uc2e4\ud328\ud588\uc2b5\ub2c8\ub2e4." }, { status: 500 });
    }
    if (!leadRow) {
      return NextResponse.json({ error: "\uace0\uac1d\uc744 \ucc3e\uc744 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4." }, { status: 404 });
    }

    const managerId = (leadRow as { manager_user_id?: string | null }).manager_user_id ?? null;
    if (role === "staff" && managerId && managerId !== requester.id) {
      return NextResponse.json({ error: "\uc774 \uace0\uac1d\uc5d0 \ub300\ud55c \ubd84\uc11d \uad8c\ud55c\uc774 \uc5c6\uc2b5\ub2c8\ub2e4." }, { status: 403 });
    }

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY\uac00 \uc124\uc815\ub418\uc9c0 \uc54a\uc558\uc2b5\ub2c8\ub2e4.", result: fallbackResult() },
        { status: 503 }
      );
    }

    const model =
      (process.env.AI_COUNSEL_MODEL ?? process.env.AI_ASSIST_MODEL ?? "gpt-4o-mini").trim() || "gpt-4o-mini";

    const userContent = [
      "Analyze this lead JSON and return ONLY the JSON object per schema.",
      JSON.stringify(context, null, 2),
    ].join("\n\n");

    const jsonSchema = {
      name: "counsel_assist_result",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          summary: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 5 },
          customerStage: { type: "string" },
          purchaseIntentScore: { type: "integer", minimum: 0, maximum: 100 },
          priceSensitivityScore: { type: "integer", minimum: 0, maximum: 100 },
          responseRiskScore: { type: "integer", minimum: 0, maximum: 100 },
          riskSignals: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 12 },
          recommendedAction: { type: "string" },
          recommendedActions: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 5 },
          messageSuggestions: {
            type: "array",
            minItems: 3,
            maxItems: 3,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                tone: { type: "string", enum: [...COUNSEL_ASSIST_MESSAGE_TONES] },
                text: { type: "string" },
              },
              required: ["tone", "text"],
            },
          },
        },
        required: [
          "summary",
          "customerStage",
          "purchaseIntentScore",
          "priceSensitivityScore",
          "responseRiskScore",
          "riskSignals",
          "recommendedAction",
          "recommendedActions",
          "messageSuggestions",
        ],
      },
    };

    const controller = new AbortController();
    const timeoutMs = 55_000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let aiRes: Response;
    try {
      aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          temperature: 0.35,
          max_tokens: 1800,
          response_format: { type: "json_schema", json_schema: jsonSchema },
          messages: [
            { role: "developer", content: developerPrompt() },
            { role: "user", content: userContent },
          ],
        }),
      });
    } finally {
      clearTimeout(timeout);
    }

    const aiData = (await aiRes.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };

    if (!aiRes.ok) {
      console.error("[counsel-assist] OpenAI error", aiData.error);
      return NextResponse.json(
        {
          ok: false,
          error: aiData.error?.message ?? "AI \ud638\ucd9c \uc2e4\ud328",
          result: fallbackResult(),
        },
        { status: 200 }
      );
    }

    const content = aiData.choices?.[0]?.message?.content?.trim() ?? "";
    const result = parseModelJson(content);

    return NextResponse.json({ ok: true, model, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "\uc11c\ubc84 \uc624\ub958";
    console.error("[counsel-assist]", error);
    return NextResponse.json({ ok: false, error: message, result: fallbackResult() }, { status: 200 });
  }
}
