import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .default("postgresql://voc:voc_dev_password@localhost:5432/voc_intelligence"),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default("llama-3.3-70b-versatile"),
  GROQ_EMBEDDING_MODEL: z.string().default("nomic-embed-text-v1_5"),
  HF_TOKEN: z.string().optional(),
  HF_DATASET_ID: z.string().optional(),
  HF_DATASET_SPLIT: z.string().default("train"),
  SCRAPE_ALLOWLIST: z
    .string()
    .default(
      "apps.apple.com,play.google.com,quora.com,twitter.com,x.com,reddit.com"
    ),
  MIN_RETRIEVAL_SCORE: z.coerce.number().default(0.72),
  MIN_EVIDENCE_ITEMS: z.coerce.number().int().default(3),
  QUOTE_MATCH_THRESHOLD: z.coerce.number().default(0.9),
  EXTRACTION_GROUNDING_THRESHOLD: z.coerce.number().default(0.85),
  LLM_TEMPERATURE: z.coerce.number().default(0),
  N8N_WEBHOOK_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (!cached) {
    cached = envSchema.parse(process.env);
  }
  return cached;
}

export function getScrapeAllowlist(): string[] {
  return getEnv()
    .SCRAPE_ALLOWLIST.split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}
