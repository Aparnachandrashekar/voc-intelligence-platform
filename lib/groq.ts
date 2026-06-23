import Groq from "groq-sdk";
import { getEnv } from "@/lib/env";

let client: Groq | null = null;

export function getGroqClient(): Groq {
  const { GROQ_API_KEY } = getEnv();
  if (!GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is not configured");
  }
  if (!client) {
    client = new Groq({ apiKey: GROQ_API_KEY });
  }
  return client;
}

export function isGroqConfigured(): boolean {
  return Boolean(getEnv().GROQ_API_KEY);
}

export interface ExtractedFeedbackItem {
  content: string;
  author: string | null;
  rating: number | null;
  created_at: string | null;
  source_url: string | null;
  product_name: string;
}

const EXTRACTION_SYSTEM_PROMPT = `You extract user feedback from web page text.
Return ONLY feedback that appears verbatim or near-verbatim in the provided page.
Do NOT invent reviews, ratings, authors, or dates.
If no feedback is found, return {"items": []}.
Respond with valid JSON only.`;

/** Test Groq connectivity with a minimal completion. */
export async function testGroqConnection(): Promise<{ ok: boolean; model: string }> {
  const env = getEnv();
  const groq = getGroqClient();
  await groq.chat.completions.create({
    model: env.GROQ_MODEL,
    temperature: 0,
    max_tokens: 16,
    messages: [
      { role: "user", content: 'Reply with exactly: {"status":"ok"}' },
    ],
  });
  return { ok: true, model: env.GROQ_MODEL };
}

/** Extract structured feedback from raw page text (Phase 1+; stub-ready in Phase 0). */
export async function extractFeedbackFromPage(
  rawText: string,
  context: { sourceUrl: string; productName?: string }
): Promise<ExtractedFeedbackItem[]> {
  const env = getEnv();
  const groq = getGroqClient();

  const response = await groq.chat.completions.create({
    model: env.GROQ_MODEL,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify({
          source_url: context.sourceUrl,
          product_name: context.productName ?? "Unknown",
          page_text: rawText.slice(0, 12000),
        }),
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    return [];
  }

  const parsed = JSON.parse(content) as { items?: ExtractedFeedbackItem[] };
  return parsed.items ?? [];
}
