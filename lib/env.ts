import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .default("postgresql://voc:voc_dev_password@localhost:5432/voc_intelligence"),
  /** Supabase session pooler region (e.g. us-east-1). Required on IPv4-only networks. */
  SUPABASE_POOLER_REGION: z.string().optional(),
  /** Session pooler port — 5432 (session) or 6543 (transaction). */
  SUPABASE_POOLER_PORT: z.coerce.number().int().optional(),
  /** Host prefix: aws-0 (legacy) or aws (current Supavisor). */
  SUPABASE_POOLER_HOST_PREFIX: z.enum(["aws-0", "aws"]).optional(),
  /** Set to false to use direct db.*.supabase.co (IPv6) instead of session pooler. */
  SUPABASE_USE_POOLER: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default("llama-3.3-70b-versatile"),
  /** Legacy; embeddings use LOCAL_EMBEDDING_MODEL (no Groq API). */
  GROQ_EMBEDDING_MODEL: z.string().default("nomic-embed-text-v1_5"),
  /** On-device embedding model (Transformers.js). No API calls. */
  LOCAL_EMBEDDING_MODEL: z
    .string()
    .default("Xenova/all-MiniLM-L6-v2"),
  /** Reviews passed to Groq for insight analysis (analyze-narrow). */
  RAG_TOP_K: z.coerce.number().int().min(1).max(20).default(15),
  /** Sample size for persona AI summaries (page load, not per query). */
  PERSONA_SAMPLE_K: z.coerce.number().int().min(1).max(100).default(50),
  /** Candidate pool for retrieval before top-k trim (retrieve-wide). */
  RAG_RETRIEVE_POOL: z.coerce.number().int().min(1).max(100).default(40),
  HF_TOKEN: z.string().optional(),
  HF_DATASET_ID: z.string().optional(),
  HF_DATASET_SPLIT: z.string().default("train"),
  // Live scrape — App Store + Play Store
  SCRAPE_ALLOWLIST: z
    .string()
    .default("apps.apple.com,play.google.com"),
  SCRAPE_USER_AGENT: z
    .string()
    .default(
      "VoC-Intelligence/1.0 (graduation project; +https://localhost)"
    ),
  SCRAPE_MAX_PER_SOURCE: z.coerce.number().int().default(100),
  /** Cosine similarity floor for local MiniLM embeddings (lower than cloud nomic). */
  MIN_RETRIEVAL_SCORE: z.coerce.number().default(0.42),
  MIN_EVIDENCE_ITEMS: z.coerce.number().int().default(3),
  /** Best-match cosine similarity to block off-topic (not keyword matches). */
  MIN_ANSWER_SIMILARITY: z.coerce.number().default(0.38),
  /** Average top-3 cosine similarity to block off-topic. */
  MIN_ANSWER_AVG_SIMILARITY: z.coerce.number().default(0.34),
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
