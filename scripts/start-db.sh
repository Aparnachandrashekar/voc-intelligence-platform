#!/usr/bin/env bash
# Start PostgreSQL for local development (creates voc-postgres on first run).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Docker Desktop on this Mac lives in ~/Applications (not /Applications).
DOCKER_BIN="${DOCKER_BIN:-$HOME/Applications/Docker.app/Contents/Resources/bin}"
if [ -d "$DOCKER_BIN" ]; then
  export PATH="$DOCKER_BIN:$PATH"
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "❌ docker command not found."
  echo "   Open Docker Desktop and ensure CLI tools are installed,"
  echo "   or set DOCKER_BIN to your Docker.app/Contents/Resources/bin folder."
  exit 1
fi

echo "Starting voc-postgres..."
docker compose up -d postgres
docker compose ps
echo ""
echo "Next: npm run db:check && npm run db:migrate && npm run db:seed-demo"
