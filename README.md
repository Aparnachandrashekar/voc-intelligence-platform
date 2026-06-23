# Voice of Customer Intelligence Platform

Phase 0 foundation for the graduation project. See [docs/phase-wise-architecture.md](./docs/phase-wise-architecture.md).

## Prerequisites

- Node.js 20+
- Docker & Docker Compose
- [Groq API key](https://console.groq.com/) (used for scraping extraction, enrichment, RAG, and embeddings)
- [Git](https://git-scm.com/) and [GitHub CLI](https://cli.github.com/) (optional, for publishing the repo)

**No OpenAI key required** — the stack uses Groq only.

---

## GitHub

The project is a local git repo on `main`. To publish to GitHub:

```bash
# 1. Log in to GitHub (one-time, opens browser)
gh auth login

# 2. Create the remote repo and push
cd "/Users/aparna/Graduation Project"
gh repo create voc-intelligence-platform --public --source=. --remote=origin --push
```

Use a different name if you prefer, e.g. `graduation-project`:

```bash
gh repo create graduation-project --public --source=. --remote=origin --push
```

**Without GitHub CLI:** create an empty repo at https://github.com/new, then:

```bash
git remote add origin https://github.com/YOUR_USERNAME/voc-intelligence-platform.git
git push -u origin main
```

Do not commit `.env.local` — it is gitignored. Secrets stay local.

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local
# Add GROQ_API_KEY (required for scrape extraction)
# Add HF_DATASET_ID when you have the Hugging Face dataset ID

# 3. Start PostgreSQL (pgvector) + n8n
docker compose up -d

# 4. Run database migration
npm run db:migrate

# 5. (Optional) Insert a test row
npm run db:seed-test

# 6. Start Next.js
npm run dev
```

Open http://localhost:3000 — the homepage shows system health.

---

## When and how to set up n8n

### When do you need n8n?

| Phase | Need n8n? | Why |
|-------|-----------|-----|
| **Phase 0** (now) | Optional | App and API work without it; n8n is included in Docker so you can verify webhooks early |
| **Phase 1** (ingestion) | **Required** | n8n schedules and orchestrates live scraping (fetch page → call `/api/scrape/extract` → write to DB) and Hugging Face import triggers |

You do **not** need to build n8n workflows in Phase 0. Start n8n when you begin Phase 1 ingestion.

### Step 1 — Start n8n (with Postgres)

From the project root:

```bash
docker compose up -d
```

This starts:

- **PostgreSQL + pgvector** on port `5432`
- **n8n** on port `5678`

Check containers:

```bash
docker compose ps
```

### Step 2 — Open the n8n UI

1. Go to **http://localhost:5678**
2. Create your owner account (first visit only — credentials are stored in the `n8n_data` Docker volume)

### Step 3 — Ensure Next.js is reachable from n8n

n8n runs **inside Docker**; your app runs on the **host**. Use these URLs in n8n HTTP Request nodes:

| Target | URL |
|--------|-----|
| Health check | `http://host.docker.internal:3000/api/health` |
| Hugging Face import | `http://host.docker.internal:3000/api/ingest/huggingface` |
| Groq scrape extract | `http://host.docker.internal:3000/api/scrape/extract` |

`host.docker.internal` is already configured in `docker-compose.yml` via `extra_hosts`.

**Before testing webhooks:** run `npm run dev` so the Next.js app is listening on port 3000.

### Step 4 — (Optional) Secure webhooks

In `.env.local`:

```bash
N8N_WEBHOOK_SECRET=your-random-secret
```

In each n8n HTTP Request node, add header:

```
x-webhook-secret: your-random-secret
```

### Step 5 — Phase 1 workflows (build later)

You will create separate n8n workflows per platform:

1. **Schedule Trigger** (daily/weekly)
2. **HTTP Request or Playwright** — fetch App Store / Play Store / Quora / Twitter / forum page
3. **HTTP Request** — `POST /api/scrape/extract` with `{ "source_url", "raw_text", "product_name" }`
4. **HTTP Request** — insert validated rows into your DB (Phase 1 API)

A separate workflow will `POST /api/ingest/huggingface` on a schedule for the Hugging Face dataset.

### Troubleshooting n8n

| Problem | Fix |
|---------|-----|
| n8n can't reach the app | Confirm `npm run dev` is running; use `host.docker.internal`, not `localhost`, inside n8n |
| Port 5678 in use | Change `"5678:5678"` in `docker-compose.yml` |
| Reset n8n data | `docker compose down -v` (deletes workflows; Postgres data too if you remove volumes) |

---

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `GROQ_API_KEY` | Yes (for scrape/RAG) | Groq LLM + embeddings |
| `HF_DATASET_ID` | Phase 1 | Hugging Face dataset to import |
| `HF_TOKEN` | If dataset is gated | Hugging Face auth |
| `DATABASE_URL` | Yes | PostgreSQL connection |
| `N8N_WEBHOOK_SECRET` | Optional | Protect ingestion webhooks |

See [.env.example](./.env.example) for the full list.

---

## Phase 0 Deliverables

| Item | Location |
|------|----------|
| Next.js + TypeScript | `app/`, `lib/` |
| PostgreSQL schema | `db/migrations/001_init.sql` |
| pgvector extension | enabled in migration |
| Health check | `GET /api/health` |
| n8n | http://localhost:5678 (Docker) |
| Groq client | `lib/groq.ts` |
| HF connector stub | `GET/POST /api/ingest/huggingface` |
| Guardrails | `lib/allowed-sources.ts`, `lib/guardrails/*` |
| Scrape extract (n8n webhook) | `POST /api/scrape/extract` |

## API Examples

```bash
# Health check
curl http://localhost:3000/api/health

# Hugging Face connector status
curl http://localhost:3000/api/ingest/huggingface

# Groq extraction (requires GROQ_API_KEY)
curl -X POST http://localhost:3000/api/scrape/extract \
  -H "Content-Type: application/json" \
  -d '{"source_url":"https://apps.apple.com/app/spotify/id324684580","raw_text":"★★★★☆ Great app but discovery is weak.","product_name":"Spotify"}'
```

## Project Structure

```
app/                    Next.js App Router (UI + API routes)
lib/                    Shared modules (db, groq, guardrails)
db/migrations/          SQL schema
scripts/                migrate + seed utilities
docker-compose.yml      PostgreSQL pgvector + n8n
docs/                   Problem statement, architecture, guardrails
```

Next: **Phase 1 — Data Ingestion** (full HF import + live scrape → DB pipelines).
