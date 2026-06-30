import { createHash } from "crypto";
import { classifyRetrievalSentimentMode } from "@/lib/retrieval/question-intent";
import { detectSegmentRetrievalIntent } from "@/lib/retrieval/segment-intent";
import type { RetrievedFeedbackItem } from "@/lib/types/feedback";
import type { ReportFilters } from "@/lib/types/reports";

export interface RetrievalCacheInput extends ReportFilters {
  query: string;
  mode?: string;
}

interface CacheEntry {
  items: RetrievedFeedbackItem[];
  cachedAt: number;
}

const cache = new Map<string, CacheEntry>();

/** Default 24h — factual re-runs of the same question hit stable cached ranking. */
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export function buildRetrievalCacheKey(options: RetrievalCacheInput): string {
  const segmentIntent = detectSegmentRetrievalIntent(options.query);
  const sentimentMode = classifyRetrievalSentimentMode(options.query);

  const payload = {
    q: options.query.trim().toLowerCase(),
    source: options.source ?? null,
    sentiment: options.sentiment ?? null,
    dateFrom: options.dateFrom ?? null,
    dateTo: options.dateTo ?? null,
    segment:
      options.segment ??
      (segmentIntent.mode === "filter" ? segmentIntent.segment : null),
    segmentMode: segmentIntent.mode,
    discoveryScope: options.discoveryScope ?? false,
    sentimentMode,
    mode: options.mode ?? "hybrid",
  };

  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function getCachedRetrieval(
  key: string,
  ttlMs = DEFAULT_TTL_MS
): RetrievedFeedbackItem[] | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > ttlMs) {
    cache.delete(key);
    return null;
  }
  return entry.items.map((item) => ({ ...item }));
}

export function setCachedRetrieval(
  key: string,
  items: RetrievedFeedbackItem[]
): void {
  cache.set(key, {
    items: items.map((item) => ({ ...item })),
    cachedAt: Date.now(),
  });
}

export function clearRetrievalCache(): void {
  cache.clear();
}
