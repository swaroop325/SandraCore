#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Sandra — Local development runner
# Usage: ./scripts/dev.sh [--skip-db] [--skip-install]
# ---------------------------------------------------------------------------
set -euo pipefail

# ── Colours ────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()  { echo -e "${CYAN}▶ $*${RESET}"; }
ok()    { echo -e "${GREEN}✓ $*${RESET}"; }
warn()  { echo -e "${YELLOW}⚠ $*${RESET}"; }
die()   { echo -e "${RED}✗ $*${RESET}" >&2; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/.env.local"

SKIP_DB=false
SKIP_INSTALL=false
for arg in "$@"; do
  case $arg in
    --skip-db)      SKIP_DB=true ;;
    --skip-install) SKIP_INSTALL=true ;;
  esac
done

echo -e "${BOLD}═══════════════════════════════════════${RESET}"
echo -e "${BOLD}  Sandra — local dev startup${RESET}"
echo -e "${BOLD}═══════════════════════════════════════${RESET}"

# ── 1. Prerequisites ────────────────────────────────────────────────────────
info "Checking prerequisites..."

node_version=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1) || die "Node.js not found. Install Node 20+."
[[ $node_version -lt 20 ]] && die "Node.js 20+ required (found v$node_version)."
ok "Node.js $(node -v)"

command -v pnpm &>/dev/null || die "pnpm not found. Run: npm install -g pnpm"
ok "pnpm $(pnpm -v)"


# ── 2. .env.local ────────────────────────────────────────────────────────────
if [[ ! -f "$ENV_FILE" ]]; then
  warn ".env.local not found — creating template at $ENV_FILE"
  cat > "$ENV_FILE" <<'EOF'
# Sandra local development environment
# Copy this file, fill in values, and re-run ./scripts/dev.sh

# Required
DATABASE_URL=postgres://postgres:postgres@localhost:5432/sandra_dev
SQS_QUEUE_URL=https://sqs.ap-southeast-1.amazonaws.com/YOUR_ACCOUNT/sandra-reminders-dev
LANCEDB_PATH=/tmp/sandra-lancedb-dev
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=dev-secret-local

# Optional
PERPLEXITY_API_KEY=
OTEL_EXPORTER_OTLP_ENDPOINT=
LOG_LEVEL=debug
PORT=3000
EOF
  echo ""
  warn "Fill in $ENV_FILE then re-run this script."
  warn "At minimum: DATABASE_URL, TELEGRAM_BOT_TOKEN, SQS_QUEUE_URL"
  exit 0
fi

info "Loading $ENV_FILE..."
set -a; source "$ENV_FILE"; set +a
ok "Environment loaded"

# ── 3. Install dependencies ─────────────────────────────────────────────────
if [[ "$SKIP_INSTALL" == false ]]; then
  info "Installing dependencies..."
  cd "$ROOT"
  pnpm install --frozen-lockfile 2>/dev/null || pnpm install
  ok "Dependencies installed"
else
  warn "Skipping install (--skip-install)"
fi

# ── 4. Build packages ────────────────────────────────────────────────────────
info "Building packages..."
cd "$ROOT"
pnpm build
ok "All packages built"

# ── 5. LanceDB directory ─────────────────────────────────────────────────────
LANCEDB_PATH="${LANCEDB_PATH:-/tmp/sandra-lancedb-dev}"
mkdir -p "$LANCEDB_PATH"
ok "LanceDB path: $LANCEDB_PATH"

# ── 6. DB migration ──────────────────────────────────────────────────────────
if [[ "$SKIP_DB" == false ]] && [[ -n "${DATABASE_URL:-}" ]]; then
  info "Running DB migrations..."
  node "$ROOT/scripts/migrate.mjs"
elif [[ "$SKIP_DB" == true ]]; then
  warn "Skipping DB migration (--skip-db)"
else
  warn "DATABASE_URL not set — skipping migration"
fi

# ── 7. Telegram webhook / ngrok ───────────────────────────────────────────
if [[ -z "${TELEGRAM_BOT_TOKEN:-}" ]]; then
  warn "TELEGRAM_BOT_TOKEN not set — Telegram disabled"
elif [[ -z "${DOMAIN:-}" ]]; then
  if command -v ngrok &>/dev/null; then
    info "Starting ngrok tunnel on port ${PORT:-3000}..."
    pkill -f "ngrok http" 2>/dev/null || true
    ngrok http "${PORT:-3000}" --log=stdout > /tmp/ngrok-sandra.log 2>&1 &
    NGROK_PID=$!
    # Poll up to 8s for ngrok to be ready
    NGROK_URL=""
    for i in 1 2 3 4 5 6 7 8; do
      sleep 1
      NGROK_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null \
        | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const t=JSON.parse(d).tunnels;const h=t?.find(x=>x.proto==='https');process.stdout.write(h?.public_url??'')}catch{}})" 2>/dev/null || true)
      [[ -n "$NGROK_URL" ]] && break
    done
    if [[ -n "$NGROK_URL" ]]; then
      export DOMAIN="${NGROK_URL#https://}"
      ok "ngrok tunnel: $NGROK_URL (DOMAIN=$DOMAIN)"
    else
      NGROK_ERR=$(grep -i "error\|authtoken\|auth" /tmp/ngrok-sandra.log 2>/dev/null | head -2 || true)
      if echo "$NGROK_ERR" | grep -qi "authtoken\|auth"; then
        warn "ngrok needs an auth token — run: ngrok config add-authtoken <your-token>"
        warn "Get your token at: https://dashboard.ngrok.com/get-started/your-authtoken"
      else
        warn "ngrok tunnel not ready — Telegram webhook skipped (check /tmp/ngrok-sandra.log)"
      fi
    fi
  else
    warn "DOMAIN not set — Telegram webhook inactive (install ngrok or set DOMAIN in .env.local)"
  fi
fi

# ── 8. Start dev server ───────────────────────────────────────────────────
echo ""
echo -e "${BOLD}═══════════════════════════════════════${RESET}"
echo -e "${GREEN}${BOLD}  Starting Sandra dev server on :${PORT:-3000}${RESET}"
echo -e "${BOLD}═══════════════════════════════════════${RESET}"
echo ""

cd "$ROOT"

# Override loadSecrets to use .env.local values already in process.env
# by setting SANDRA_LOCAL_DEV=true which the app can check
export SANDRA_LOCAL_DEV=true

# Kill any previously running Sandra processes so the port is free
lsof -ti :"${PORT:-3000}" | xargs kill -9 2>/dev/null || true
pkill -9 -f "apps/api-server/dist/server.js" 2>/dev/null || true
pkill -9 -f "apps/worker/dist/reminder-consumer.js" 2>/dev/null || true

# Run api-server and worker in parallel, kill both on Ctrl+C
trap 'echo ""; info "Stopping..."; kill 0' INT TERM

node --experimental-vm-modules apps/api-server/dist/server.js &
API_PID=$!

if [[ -n "${SQS_QUEUE_URL:-}" ]]; then
  node apps/worker/dist/reminder-consumer.js &
  WORKER_PID=$!
  info "Worker started (PID $WORKER_PID)"
else
  warn "SQS_QUEUE_URL not set — worker not started"
fi

ok "API server started (PID $API_PID)"
info "Health: http://localhost:${PORT:-3000}/health"
echo ""

wait
