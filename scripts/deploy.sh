#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Sandra — Server setup + deployment
#
# First-time setup:   ./scripts/deploy.sh --setup
# Code redeploy only: ./scripts/deploy.sh
# Specific channel:   ./scripts/deploy.sh --channel beta
#
# Run this ON the Lightsail server (Ubuntu 22.04) as the ubuntu user,
# OR run it locally with SSH by piping:
#   ssh ubuntu@your-server 'bash -s' < scripts/deploy.sh
# ---------------------------------------------------------------------------
set -euo pipefail

# ── Colours ────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()  { echo -e "${CYAN}▶ $*${RESET}"; }
ok()    { echo -e "${GREEN}✓ $*${RESET}"; }
warn()  { echo -e "${YELLOW}⚠ $*${RESET}"; }
die()   { echo -e "${RED}✗ $*${RESET}" >&2; exit 1; }
step()  { echo -e "\n${BOLD}── $* ──${RESET}"; }

# ── Defaults ────────────────────────────────────────────────────────────────
CHANNEL="stable"
DO_SETUP=false
REPO_URL=""
DEPLOY_DIR="/opt/sandra"
LANCEDB_DIR="/var/sandra/lancedb"
PM2_ECOSYSTEM="infra/pm2/${CHANNEL}.config.js"
NGINX_CONF="infra/nginx/nginx.conf"
DOMAIN="${DOMAIN:-}"

for arg in "$@"; do
  case $arg in
    --setup)           DO_SETUP=true ;;
    --channel=*)       CHANNEL="${arg#*=}" ;;
    --domain=*)        DOMAIN="${arg#*=}" ;;
    --repo=*)          REPO_URL="${arg#*=}" ;;
    --dir=*)           DEPLOY_DIR="${arg#*=}" ;;
  esac
done

PM2_ECOSYSTEM="infra/pm2/${CHANNEL}.config.js"

echo -e "${BOLD}═══════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  Sandra — deploy  [channel: ${CHANNEL}]${RESET}"
echo -e "${BOLD}═══════════════════════════════════════════════${RESET}"

# ── Must run as non-root with sudo access ────────────────────────────────────
[[ "$EUID" -eq 0 ]] && die "Do not run as root. Run as ubuntu (or your deploy user)."
command -v sudo &>/dev/null || die "sudo not available."

# ════════════════════════════════════════════════════════════════════════════
# FIRST-TIME SETUP  (--setup flag)
# ════════════════════════════════════════════════════════════════════════════
if [[ "$DO_SETUP" == true ]]; then

  step "System packages"
  sudo apt-get update -qq
  sudo apt-get install -y -qq \
    curl git nginx certbot python3-certbot-nginx \
    build-essential

  step "Node.js 24"
  if ! node -v 2>/dev/null | grep -q "^v2[4-9]"; then
    curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
    sudo apt-get install -y nodejs
  fi
  ok "$(node -v)"

  step "pnpm + PM2"
  sudo npm install -g pnpm pm2
  ok "pnpm $(pnpm -v)  |  pm2 $(pm2 -v)"

  step "Application directory"
  sudo mkdir -p "$DEPLOY_DIR"
  sudo chown "$(whoami):$(whoami)" "$DEPLOY_DIR"
  ok "$DEPLOY_DIR"

  step "LanceDB storage"
  sudo mkdir -p "$LANCEDB_DIR"
  sudo chown "$(whoami):$(whoami)" "$LANCEDB_DIR"
  ok "$LANCEDB_DIR"

  step "Nginx configuration"
  if [[ -z "$DOMAIN" ]]; then
    warn "DOMAIN not set — skipping nginx/certbot config."
    warn "Re-run with --domain=your-domain.com after DNS is pointed here."
  else
    NGINX_SITE="/etc/nginx/sites-available/sandra"
    sudo tee "$NGINX_SITE" > /dev/null <<NGINX
server {
    listen 80;
    server_name ${DOMAIN};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    server_name ${DOMAIN};

    ssl_certificate     /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host            \$host;
        proxy_set_header X-Real-IP       \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header Upgrade         \$http_upgrade;
        proxy_set_header Connection      "upgrade";
    }
}
NGINX
    sudo ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/sandra
    sudo rm -f /etc/nginx/sites-enabled/default
    sudo nginx -t && sudo systemctl reload nginx
    ok "Nginx configured for $DOMAIN"

    step "TLS certificate (certbot)"
    sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos \
      --email "admin@${DOMAIN}" --redirect \
      || warn "Certbot failed — DNS may not be pointed yet. Re-run after DNS propagates."
  fi

  step "PM2 startup"
  pm2 startup | tail -1 | sudo bash || true
  ok "PM2 startup configured"

  step "Setup complete"
  echo ""
  ok "Server is ready. Now run without --setup to deploy the application:"
  echo "  ./scripts/deploy.sh --domain=$DOMAIN"
  echo ""
  exit 0
fi

# ════════════════════════════════════════════════════════════════════════════
# DEPLOY / REDEPLOY
# ════════════════════════════════════════════════════════════════════════════

step "Prerequisites check"
command -v node &>/dev/null  || die "Node.js not installed. Run with --setup first."
command -v pnpm &>/dev/null  || die "pnpm not installed. Run with --setup first."
command -v pm2  &>/dev/null  || die "PM2 not installed. Run with --setup first."
ok "node $(node -v) | pnpm $(pnpm -v) | pm2 $(pm2 -v)"

# ── Resolve deploy directory ─────────────────────────────────────────────────
if [[ -f "$DEPLOY_DIR/package.json" ]]; then
  # Already cloned
  cd "$DEPLOY_DIR"
  step "Pull latest code"
  git fetch --all
  git reset --hard origin/main
  ok "Code updated"
elif [[ -n "$REPO_URL" ]]; then
  step "Clone repository"
  git clone "$REPO_URL" "$DEPLOY_DIR"
  cd "$DEPLOY_DIR"
  ok "Cloned to $DEPLOY_DIR"
elif [[ -f "$(pwd)/package.json" ]] && grep -q '"name": "sandra-core"' "$(pwd)/package.json" 2>/dev/null; then
  # Running from the repo itself (e.g. dev machine)
  cd "$(pwd)"
  warn "Using current directory: $(pwd)"
else
  die "No repo found at $DEPLOY_DIR. Pass --repo=<git-url> for first deploy."
fi

step "Install dependencies"
pnpm install --frozen-lockfile
ok "Dependencies installed"

step "Build all packages"
pnpm build
ok "Build complete"

step "Run database migrations"
if command -v tsx &>/dev/null; then
  tsx scripts/migrate.ts && ok "Migrations applied" || warn "Migration failed or already up to date"
else
  # tsx not globally available — use node with ts-node
  node --import tsx/esm scripts/migrate.ts && ok "Migrations applied" \
    || warn "Migration skipped (tsx not available globally — install: npm i -g tsx)"
fi

step "Deploy with PM2 [${CHANNEL}]"
if pm2 list | grep -q "sandra-api"; then
  # Reload in-place (zero-downtime for cluster mode)
  pm2 startOrRestart "$PM2_ECOSYSTEM" --update-env
  ok "PM2 processes reloaded"
else
  pm2 start "$PM2_ECOSYSTEM" --update-env
  ok "PM2 processes started"
fi

step "Save PM2 process list"
pm2 save
ok "PM2 state saved"

step "Health check"
sleep 3
PORT="${PORT:-3000}"
if curl -sf "http://localhost:$PORT/health" | grep -q '"status":"ok"'; then
  ok "Health check passed"
  curl -s "http://localhost:$PORT/health" | python3 -m json.tool 2>/dev/null || true
else
  warn "Health check did not return ok — check logs:"
  echo "  pm2 logs sandra-api --lines 50"
fi

echo ""
echo -e "${BOLD}═══════════════════════════════════════════════${RESET}"
echo -e "${GREEN}${BOLD}  Deployment complete [${CHANNEL}]${RESET}"
echo -e "${BOLD}═══════════════════════════════════════════════${RESET}"
echo ""
echo "  pm2 status              — view process status"
echo "  pm2 logs sandra-api     — stream API logs"
echo "  pm2 logs sandra-worker  — stream worker logs"
if [[ -n "$DOMAIN" ]]; then
  echo "  https://$DOMAIN/health  — public health endpoint"
fi
echo ""
