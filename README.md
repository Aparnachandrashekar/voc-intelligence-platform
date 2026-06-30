# Voice of Customer Intelligence Platform

Dual-mode platform: **Analysis Engine (primary)** + **RAG Ask (secondary)**.

Data source: **live-scraped App Store + Play Store reviews only** (no Kaggle bulk import).

## Web UI

| Area | Route | Purpose |
|------|-------|---------|
| **Dashboard** (landing) | `/dashboard` | KPIs, charts, pipeline status, embedded Ask |
| **Ask** | `/ask` | RAG Q&A with evidence guardrails |
| **Reports** | `/reports/overview`, `/pain-points`, `/feature-requests`, `/trends`, `/segments` | SQL-driven analysis with filters and verbatim quotes |
| **Explore** | `/explore` | Hybrid semantic + keyword search |

## Quick Start

```bash
npm install
cp .env.example .env.local   # add GROQ_API_KEY when ready
docker compose up -d
npm run db:migrate
npm run db:seed-demo         # 6 live-scrape demo reviews (App/Play Store)
npm run dev
```

Or use `npm run db:start` instead of `docker compose up -d` if the `docker` command is not on your PATH (see [learning_log.md](./learning_log.md)).

Open **http://localhost:3001/dashboard** (port **3001** — not 3000).

If the UI looks unstyled or stuck on “Loading…”, restart: `rm -rf .next && npm run dev`.

**Troubleshooting:** `npm run db:check` — tests Postgres connectivity. See [issues.md](./issues.md) for RAG reliability notes.

## Data Ingestion

Single pipeline — **live scrape** from App Store and Play Store:

```bash
npm run ingest:live
npm run enrich
npm run embed
```

Targets are configured in [config/scrape-targets.spotify.json](./config/scrape-targets.spotify.json).

**Upgrading from Kaggle import?** Remove legacy rows:

```bash
npm run purge:static
npm run enrich
npm run embed
```

## Key API Routes

| Endpoint | Purpose |
|----------|---------|
| `POST /api/ingest/live` | Run App Store + Play Store scrape |
| `POST /api/scrape/extract` | Groq extraction + grounded insert for HTML pages |
| `GET /api/health` | DB, pgvector, Groq, scrape status |
| `GET /api/warm` | Preload embedding model |
| `POST /api/query` | RAG Q&A |
| `POST /api/search` | Hybrid search |

## Deployment

See **[docs/deployment-plan.md](./docs/deployment-plan.md)** for production setup, env vars, cron jobs, and hosting options.

## Architecture

See [docs/problemstatement.md](./docs/problemstatement.md) and [docs/phase-wise-architecture.md](./docs/phase-wise-architecture.md).
