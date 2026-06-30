# Deployment Plan — Voice of Customer Intelligence Platform

This document describes how to deploy the Spotify review intelligence app to production using **live App Store + Play Store scrape only** (no Kaggle bulk import).

---

## 1. Architecture overview

```mermaid
flowchart LR
  subgraph sources [Data sources]
    AS[Apple App Store]
    GP[Google Play Store]
  end

  subgraph app [Application]
    NEXT[Next.js 15 app]
    EMB[Local embeddings Transformers.js]
    GROQ[Groq API — RAG synthesis]
  end

  subgraph data [Data layer]
    PG[(PostgreSQL + pgvector)]
  end

  AS -->|live scrape| NEXT
  GP -->|live scrape| NEXT
  NEXT --> PG
  NEXT --> EMB
  NEXT --> GROQ
```

| Component | Role |
|-----------|------|
| **Next.js app** | Dashboard, reports, Ask (RAG), API routes |
| **PostgreSQL 16 + pgvector** | Reviews, enrichment, embeddings, query log |
| **Live scrape** | `npm run ingest:live` — App Store + Play Store via `config/scrape-targets.spotify.json` |
| **Groq** | RAG answer synthesis only (`GROQ_API_KEY`) |
| **Local embeddings** | On-server `Xenova/all-MiniLM-L6-v2` — no embedding API |

---

## 2. Prerequisites

- **Host** with Docker (or managed Postgres), Node 20+, 4 GB+ RAM (embeddings model ~90 MB in memory)
- **Groq API key** for Ask / RAG
- **Outbound HTTPS** to App Store, Play Store, Groq
- **Optional:** n8n or cron for scheduled `ingest:live`

---

## 3. Environment variables (production)

Copy from `.env.example`. Required and recommended values:

| Variable | Required | Notes |
|----------|----------|--------|
| `DATABASE_URL` | Yes | Production Postgres connection string with SSL if remote |
| `GROQ_API_KEY` | Yes (for Ask) | Without it, RAG falls back to heuristic synthesis |
| `GROQ_MODEL` | No | Default `llama-3.3-70b-versatile` |
| `LOCAL_EMBEDDING_MODEL` | No | Default `Xenova/all-MiniLM-L6-v2` |
| `RAG_RETRIEVE_POOL` | No | Default 40 |
| `RAG_TOP_K` | No | Default 12 |
| `SCRAPE_ALLOWLIST` | No | Default `apps.apple.com,play.google.com` |
| `SCRAPE_MAX_PER_SOURCE` | No | Cap per scrape run |
| `N8N_WEBHOOK_SECRET` | Recommended | Protects `POST /api/ingest/live` |
| `NEXT_PUBLIC_APP_URL` | Recommended | Public URL for health checks |

**Removed (do not set):** `STATIC_DATASET_PATH`, `KAGGLE_*` — Kaggle static import is no longer supported.

---

## 4. Database setup

### 4.1 Provision Postgres with pgvector

**Option A — Docker (single VM)**

```bash
docker compose up -d postgres
```

Uses `pgvector/pgvector:pg16` from project `docker-compose.yml`.

**Option B — Managed Postgres**

- Enable **pgvector** extension (Supabase, Neon, RDS with pgvector, etc.)
- Run migrations against the instance

### 4.2 Run migrations

```bash
export DATABASE_URL="postgresql://user:pass@host:5432/voc_intelligence"
npm run db:migrate
```

Migrations live in `db/migrations/*.sql` (applied in order by `scripts/migrate.ts`).

### 4.3 Purge legacy Kaggle rows (if upgrading)

If the DB previously imported the Kaggle CSV:

```bash
npm run purge:static
npm run enrich
npm run embed
```

This deletes `ingestion_pipeline = 'static_import'` rows and their embeddings/enrichment.

---

## 5. Application build & run

### 5.1 Install and build

```bash
npm ci
npm run build    # outputs to .next-build/
npm run start    # port 3001 by default
```

For development: `npm run dev` (also port 3001).

### 5.2 First-time data pipeline

Run on the server (or CI job) after deploy:

```bash
# 1. Scrape App Store + Play Store reviews
npm run ingest:live

# 2. AI-tag sentiment, themes, pain points (Groq)
npm run enrich

# 3. Build local embeddings for search + RAG
npm run embed
```

**Warm embeddings on first request:** `GET /api/warm` preloads the model. The Ask page calls this automatically.

### 5.3 Ongoing ingestion schedule

| Job | Frequency | Command / endpoint |
|-----|-----------|-------------------|
| Live scrape | Daily or weekly | `npm run ingest:live` or `POST /api/ingest/live` |
| Enrichment | After each ingest | `npm run enrich` or `POST /api/enrich` |
| Embeddings | After enrich | `npm run embed` or `POST /api/embed` |

Example cron (daily 02:00 UTC):

```cron
0 2 * * * cd /app && npm run ingest:live && npm run enrich && npm run embed
```

Protect webhook calls with header `x-webhook-secret: $N8N_WEBHOOK_SECRET`.

---

## 6. Deployment targets (choose one)

### Option A — Single VPS (simplest for graduation demo)

1. Ubuntu VM with Docker + Node 20
2. Clone repo, set `.env.local`
3. `docker compose up -d postgres`
4. `npm run db:migrate && npm run ingest:live && npm run enrich && npm run embed`
5. Run app with **PM2** or systemd:

```bash
pm2 start npm --name voc -- start
```

6. Put **Caddy** or **nginx** in front with TLS (Let's Encrypt)

### Option B — Vercel (frontend) + Render (backend) **← recommended for graduation demo**

Split the monolith so the UI stays fast on Vercel while Postgres, embeddings, and long-running jobs live on Render.

```mermaid
flowchart LR
  subgraph vercel [Vercel]
    UI[Next.js UI + read API routes]
  end

  subgraph render [Render]
    API[Web Service — Next.js or Express API]
    CRON[Cron Jobs — ingest / enrich / embed]
    PG[(PostgreSQL + pgvector)]
  end

  subgraph external [External]
    GROQ[Groq API]
    STORES[App Store + Play Store]
  end

  UI -->|HTTPS read-only| API
  API --> PG
  API --> GROQ
  CRON --> STORES
  CRON --> PG
```

| Layer | Platform | What runs there |
|-------|----------|-----------------|
| **Frontend** | **Vercel** | Static pages, dashboard, reports, `/ask` UI (can proxy to Render API) |
| **Backend API** | **Render Web Service** | `/api/query`, `/api/warm`, `/api/health`, search + RAG with local embeddings |
| **Database** | **Render Postgres** (or Neon/Supabase) | `feedback_items`, `enrichment_results`, `embeddings` — enable **pgvector** |
| **Workers** | **Render Cron Jobs** | `ingest:live` → `enrich` → `embed:active` on a schedule |

#### Why split?

| Concern | Vercel alone | Render backend |
|---------|--------------|----------------|
| Local Transformers.js embeddings | Cold start 30–60s | Always-on instance, model stays warm |
| `ingest:live` / `embed:active` | Exceeds serverless timeout | Cron or background worker |
| RAG `/api/query` | Risky on 10s Hobby limit | 512 MB–2 GB RAM, 60s+ timeout |
| pgvector | External DB required anyway | Render Postgres or managed pgvector |

#### Step-by-step

**1. Render — Postgres**

1. Create **PostgreSQL** on Render (or use [Neon](https://neon.tech) with pgvector).
2. Enable extension: `CREATE EXTENSION IF NOT EXISTS vector;`
3. Copy **Internal Database URL** for the web service; use **External URL** only for local migrations.

**2. Render — Web Service (backend)**

1. New **Web Service** → connect GitHub repo.
2. **Root directory:** repo root.
3. **Build command:** `npm ci && npm run build`
4. **Start command:** `npm run start` (port `$PORT`; set `next start -p $PORT` if needed).
5. **Instance type:** at least **Starter (512 MB)**; **Standard (2 GB)** recommended for embeddings.
6. **Environment variables** (Render dashboard):

   | Variable | Value |
   |----------|--------|
   | `DATABASE_URL` | Render Postgres internal URL |
   | `GROQ_API_KEY` | Your Groq key |
   | `LOCAL_EMBEDDING_MODEL` | `Xenova/all-MiniLM-L6-v2` |
   | `N8N_WEBHOOK_SECRET` | Random secret for ingest webhooks |
   | `NODE_ENV` | `production` |

7. After first deploy, open **Shell** on Render and run once:

   ```bash
   npm run db:migrate
   npm run ingest:live
   npm run enrich
   npm run embed:active
   ```

**3. Render — Cron Jobs**

| Job | Schedule | Command |
|-----|----------|---------|
| Ingest | `0 2 * * 0` (weekly) | `npm run ingest:live && npm run enrich && npm run embed:active` |

Use the same env vars as the web service. Point cron at the same repo + branch.

**4. Vercel — Frontend**

**Option 4a — Full Next.js on Vercel (simplest, API on Vercel too)**  
If the Render backend handles only DB + cron and Vercel talks to external Postgres:

1. Import repo on Vercel.
2. Set `DATABASE_URL` to **external** Postgres URL (with `?sslmode=require`).
3. Increase **Function max duration** (Pro: 60s+) for `/api/query` and `/api/warm`.
4. Accept cold starts on first Ask query, or call `/api/warm` from a Vercel cron.

**Option 4b — UI-only on Vercel, API on Render (cleanest split)**  
1. Deploy UI to Vercel with `NEXT_PUBLIC_API_URL=https://your-app.onrender.com`.
2. Add rewrites in `next.config.ts` so browser calls `/api/*` → Render backend (or call Render URL directly from client).
3. Vercel serves pages only; all `/api/*` hit Render.

**5. Post-deploy verification**

```bash
curl -s https://your-backend.onrender.com/api/health | jq
curl -s https://your-backend.onrender.com/api/warm | jq
curl -s -X POST https://your-backend.onrender.com/api/query \
  -H "Content-Type: application/json" \
  -d '{"question":"What frustrates users about ads?"}' | jq '.status'
```

**6. Custom domains**

| Service | Domain example |
|---------|----------------|
| Vercel | `review-engine.vercel.app` or `demo.yourdomain.com` |
| Render | `review-engine-api.onrender.com` |

**7. Cost estimate (demo scale)**

| Service | Approx. |
|---------|---------|
| Vercel Hobby | Free |
| Render Web Starter | ~$7/mo |
| Render Postgres Starter | ~$7/mo |
| Groq | Free tier / pay-per-token |

---

### Option C — Vercel + external Postgres (UI only, no Render)

| Works | Limitation |
|-------|------------|
| Next.js UI + API routes | Serverless timeout — long ingest/enrich/embed must run as **separate workers**, not on Vercel |
| RAG `/api/query` | OK if warm + query finish within function timeout; increase timeout or use dedicated Node host for Ask |
| Local embeddings | Cold starts slow; consider always-on Node host for production Ask |

**Recommended split:** Vercel for UI + read-only reports; small **Railway / Fly.io / Render** worker for ingest + embed + Groq-heavy routes.

### Option D — Docker Compose all-in-one

Extend `docker-compose.yml` with an `app` service:

- Build from `Dockerfile` (Node 20, `npm run build`, `npm run start`)
- Depends on `postgres`
- Mount `.env` or use compose `environment:`

Suitable for demo/staging on one machine.

---

## 7. Health checks & monitoring

| Endpoint | Use |
|----------|-----|
| `GET /api/health` | DB, pgvector, Groq connectivity, live scrape last run |
| `GET /api/warm` | Embedding model + embedding count |
| `GET /api/dashboard/status` | Per-source pipeline health (App Store, Play Store) |

**Production checklist after deploy:**

```bash
curl -s https://your-domain/api/health | jq
curl -s https://your-domain/api/warm | jq
curl -s -X POST https://your-domain/api/query \
  -H "Content-Type: application/json" \
  -d '{"question":"Why do users hate shuffle?"}' | jq '.status'
```

Expect: `health.status = ok`, `warm.ready = true`, `query.status = completed`.

---

## 8. Security

- Never commit `.env.local` or secrets
- Set `N8N_WEBHOOK_SECRET` on ingest endpoints
- Restrict Postgres to app subnet / private network
- Groq key server-side only (never `NEXT_PUBLIC_*`)
- Scrape allowlist locked to App Store + Play Store domains

---

## 9. Corpus scope (important)

All reports, dashboard metrics, search, and RAG **default to live-scraped App Store + Play Store reviews only**:

- `ingestion_pipeline = 'live_scrape'`
- `source IN ('app_store', 'play_store')`

Legacy Kaggle rows are excluded from queries even if not purged. Run `npm run purge:static` to reclaim disk and re-index.

---

## 10. Rollback & recovery

| Scenario | Action |
|----------|--------|
| Bad scrape batch | Delete recent rows by `ingested_at` or re-run ingest (dedupe by `source_id`) |
| Embedding model change | Re-run `npm run embed` after updating `LOCAL_EMBEDDING_MODEL` |
| Groq outage | Ask still works via heuristic synthesis; insights quality reduced |
| DB restore | Restore Postgres snapshot; re-run `embed` if embeddings table lost |

---

## 11. Suggested deployment sequence (checklist)

- [ ] Provision Postgres + pgvector
- [ ] Set production env vars (no Kaggle vars)
- [ ] `npm run db:migrate`
- [ ] `npm run purge:static` (if upgrading from Kaggle)
- [ ] Build & start app (`npm run build && npm run start`)
- [ ] `npm run ingest:live`
- [ ] `npm run enrich && npm run embed`
- [ ] Verify `/api/health`, `/api/warm`, `/ask`
- [ ] Schedule cron for ingest → enrich → embed
- [ ] TLS + domain in front of app
- [ ] Document demo URL for graduation submission

---

## Related docs

- [README.md](../README.md) — local quick start
- [issues.md](../issues.md) — known RAG reliability issues
- [docs/guardrails.md](./guardrails.md) — anti-hallucination rules
- [config/scrape-targets.spotify.json](../config/scrape-targets.spotify.json) — scrape tuning
