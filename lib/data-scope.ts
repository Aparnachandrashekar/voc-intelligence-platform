/** Active corpus: live-scraped App Store + Play Store reviews only. */
export const ACTIVE_SOURCES = ["app_store", "play_store"] as const;
export const ACTIVE_PIPELINE = "live_scrape" as const;

export function liveStoreScopeClause(
  alias = "f",
  startParamIndex = 1
): { clause: string; params: unknown[] } {
  return {
    clause: `${alias}.ingestion_pipeline = $${startParamIndex} AND ${alias}.source = ANY($${startParamIndex + 1}::text[])`,
    params: [ACTIVE_PIPELINE, [...ACTIVE_SOURCES]],
  };
}
