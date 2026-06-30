# Known Issues & RAG Reliability Log

This file records recurring problems, root causes, and fixes so they are not repeated.  
Last updated: 2026-06-27

---

## RAG bot “glitching” / not working (2026-06-27)

### Symptoms users reported

- Ask page appears to hang, flash blank, or return errors intermittently
- First question after page load sometimes fails or times out
- During development, `/api/query` returns **500** for a few seconds then works again
- Report sections briefly invisible or flicker when a new answer loads

### Root causes (verified)

| # | Cause | Severity | What happened |
|---|--------|----------|----------------|
| 1 | **Evidence gate used wrong score scale** | High | `evaluateEvidenceGate` treated `similarity_score ?? keyword_score ?? hybrid_score` as one number. Hybrid RRF scores are ~0.01–0.03; ts_rank keyword scores are ~0.003–0.04. Items with only keyword matches were dropped even when relevant, causing false “insufficient evidence” or empty synthesis. |
| 2 | **Cold embedding model on first query** | High | Local Transformers.js model loads on first embed (~2–15s). `/api/warm` preloads it, but the UI aborted warm at **20s** and allowed queries before warm finished. First `/api/query` also compiled on demand in dev (+1–3s). Users saw long spinners or timeouts. |
| 3 | **UI cleared previous answer on every ask** | Medium | `setResponse(null)` before fetch made the report vanish and re-mount — felt like a glitch. |
| 4 | **GSAP animation left blocks at opacity 0** | Medium | `gsap.fromTo` set `.research-block { opacity: 0 }` without cleanup. Interrupted re-renders could leave content invisible. |
| 5 | **Dev hot-reload 500s** | Medium (dev only) | While saving files, Next.js served broken intermediate bundles (`RagPanel.tsx` syntax error, missing exports like `questionHasKnownTopic`). Terminal showed `POST /api/query 500 in 85ms`. Not a production issue but looks like “bot broken” during active coding. |
| 6 | **Groq path could return empty completed answer** | Medium | If Groq JSON parsed but `executive_summary` / `detailed_analysis` were empty after filtering, or all quotes failed validation, the API could return `completed` with nothing useful — or flip to `insufficient_evidence` despite having retrieval hits. |
| 7 | **Generic 500 error message** | Low | Client showed “Query failed” with no hint about DB down, compile-in-progress, or warm-up. |

### Fixes applied (2026-06-27)

1. **`lib/guardrails/retrieval-score.ts`** — separate qualification logic:
   - Cosine similarity ≥ `MIN_RETRIEVAL_SCORE` (default 0.38)
   - OR keyword ts_rank ≥ 0.03
   - OR ILIKE fallback score ≥ 0.45  
   - Never use hybrid RRF score for gating.

2. **`app/api/query/route.ts`** — call `warmEmbeddingModel()` before every query; log errors; return actionable 500 hints (DB down, wait for compile).

3. **`lib/rag.ts`** — log search failures; fall back to heuristic response when Groq output is empty after filtering (instead of empty `completed`).

4. **`app/components/RagPanel.tsx`**
   - Warm timeout increased to **45s**; track `searchReady` before enabling submit
   - Keep previous report visible while loading (stale-while-revalidate)
   - GSAP uses `gsap.context()` + `revert()` on unmount
   - Clearer timeout and 500 error copy

5. **`scripts/rag-diagnose.ts`** — CLI to check gate pass rates per question (for future debugging).

### How to verify RAG is healthy

```bash
# 1. Database + embeddings
curl -s http://localhost:3001/api/health | jq '.checks.database, .checks.pgvector'

# 2. Warm search model (should return ready: true, embeddings > 0)
curl -s http://localhost:3001/api/warm | jq

# 3. Sample query
curl -s -X POST http://localhost:3001/api/query \
  -H "Content-Type: application/json" \
  -d '{"question":"Why do users hate shuffle?"}' | jq '.status, .executive_summary'

# 4. Gate diagnostics (optional)
npx tsx scripts/rag-diagnose.ts
```

Expected: `status` = `"completed"`, non-empty `executive_summary`, `detailed_analysis`, and `supporting_quotes`.

### Operational checklist (before demo / testing)

- [ ] App on **port 3001** (or free 3000) — see [learning_log.md](./learning_log.md)
- [ ] `docker compose up -d postgres` running
- [ ] `.env.local` has `GROQ_API_KEY` (optional — heuristic fallback works without it)
- [ ] Embeddings exist: `curl /api/warm` → `embeddings` > 0
- [ ] Wait for “Preparing…” to finish on `/ask` before first question
- [ ] After editing RAG files in dev, wait for “Compiled /api/query” before clicking Research

---

## Client bundle importing server code (2026-06-27)

**Symptom:** `/ask` and `/api/query` return 500; error `Module not found: Can't resolve 'fs'` with import trace through `rag-synthesis → rag-stats → db → pg`.

**Cause:** `rag-synthesis.ts` (imported by client `RagPanel.tsx` for `parseDetailedBullets`) imported `extractQuestionTopicTerms` from `rag-stats.ts`, which imports PostgreSQL.

**Fix:** Move topic helpers to `lib/rag-topics.ts` (no DB imports). Client-safe modules must never import `rag-stats`, `rag`, or `db`.

**Prevention:** Before importing anything into client components, verify the import chain does not reach `pg`, `fs`, or `@/lib/db`.

---

## Templated garbage in synthesis (2026-06-27)

**Symptom:** Answers like `Users ask for y'all should add` or executive summaries that only list theme category names (`Podcasts & Audio Shows, Playback & Audio Quality…`).

**Root causes:**
1. Heuristic `buildDetailedAnalysis` plugged raw `feature_requests` enrichment tags into `"Users ask for {fragment}"` without `isUsableFindingPhrase` validation.
2. When pain-point phrases were missing, synthesis fell back to **theme labels** instead of review text.
3. `reviewDisplaySummary()` in Supporting signals **hid actual quotes** and showed `"Negative signal around podcasts — synthesized from review patterns, not a direct quote."`

**Fixes:**
- `extractRelevantSentences()` pulls real review sentences matching the question topic.
- All pain/request phrases filtered through `isUsableFindingPhrase` before use.
- Removed `"Users ask for … pointing to unmet demand"` template; use quoted review language instead.
- RAG panel uses `formatReviewExcerpt()` to show actual review text in Supporting signals.
- Groq output rejecting templated garbage bullets falls back to sentence-based heuristic.

**Prevention:** Never template enrichment array values into prose without validation.

**Pass 2 (same day):** Quote-dump heuristic (`"One reviewer writes: …"`) replaced entirely by `buildInsightNarrative()` — paraphrased theme insights in Executive/Detailed; raw quotes only in Supporting signals.

**Pass 3 (same day):** `text.trim is not a function` — Groq sometimes returns `detailed_analysis` as a **JSON array** instead of a string. Fixed with `coerceToText()` before any `.trim()` call.

---

## Wrong port (404) — recurring

**Symptom:** Browser shows 404 on `localhost:3000`.  
**Cause:** Another process uses 3000; Next.js serves this app on **3001**.  
**Fix:** Open `http://localhost:3001/ask` or kill the process on 3000.

---

## Postgres not running (503 / ECONNREFUSED)

**Symptom:** Health check `database.ok: false`, queries fail.  
**Fix:** `docker compose up -d postgres` then `npm run db:check` (if script exists) or `curl /api/health`.

---

## Insight-first refactor: over-aggressive meta filter (2026-06-27)

**Symptom:** Detailed Research empty or thin after insight-first change.  
**Cause:** `filterInsightBullets()` / `isMetaInsightBullet()` stripping valid bullets that mention “sample” or corpus terms.  
**Mitigation:** Groq + heuristic paths both fall back to `buildHeuristicResponse` when filtered output is empty (`lib/rag.ts`).  
**If it recurs:** Loosen `isMetaInsightBullet` patterns; never filter executive summary through bullet rules.

---

## Prevention rules for future RAG changes

1. **Never gate on hybrid RRF scores** — only cosine similarity and keyword ranks (see `retrieval-score.ts`).
2. **Always warm embeddings** on `/api/warm` and before `/api/query`.
3. **Never clear the UI report** until a new successful response arrives.
4. **Always provide a heuristic fallback** when Groq fails, JSON is invalid, or filtered output is empty.
5. **Animate with cleanup** — use `gsap.context().revert()` or CSS transitions only.
6. **Test the full path** after edits: warm → query → completed with quotes.
7. **Run** `npx tsc --noEmit` and `npx tsx scripts/rag-diagnose.ts` before declaring RAG done.

---

## Related docs

- [docs/guardrails.md](./docs/guardrails.md) — anti-hallucination rules
- [docs/edge-cases.md](./docs/edge-cases.md) — retrieval and RAG edge cases
- [learning_log.md](./learning_log.md) — local dev setup notes
