#!/usr/bin/env bash
# =============================================================================
# AJKMart Universal Setup Script
# Works on: Replit · GitHub Codespaces · Ubuntu/Debian VPS · Local Mac/Linux
# Usage:  bash scripts/setup.sh
# =============================================================================
set -euo pipefail

BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()    { echo -e "${GREEN}[setup]${NC} $*"; }
warn()    { echo -e "${YELLOW}[warn]${NC}  $*"; }
error()   { echo -e "${RED}[error]${NC} $*"; exit 1; }
section() { echo -e "\n${BOLD}━━━  $*  ━━━${NC}"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

# ── 1. Node.js ────────────────────────────────────────────────────────────────
section "Step 1/4 — Node.js"
if ! command -v node &>/dev/null; then
  warn "Node.js not found. Installing via nvm..."
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  # shellcheck disable=SC1090
  source "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
  nvm install 20
  nvm use 20
fi
NODE_VER=$(node --version)
info "Node.js $NODE_VER"
[[ "${NODE_VER%%.*}" == "v20" || "${NODE_VER%%.*}" == "v22" ]] || \
  warn "Expected Node 20.x or 22.x, got $NODE_VER — things may still work."

# ── 2. pnpm ───────────────────────────────────────────────────────────────────
section "Step 2/4 — pnpm"
if ! command -v pnpm &>/dev/null; then
  info "Installing pnpm..."
  npm install -g pnpm@10
fi
PNPM_VER=$(pnpm --version)
info "pnpm $PNPM_VER"

# ── 3. Dependencies (race-condition-safe) ─────────────────────────────────────
section "Step 3/4 — Installing dependencies"
# Use flock if available (Linux) to prevent concurrent install races.
# On macOS / Codespaces without util-linux, fall back to plain install.
LOCKFILE="/tmp/ajkmart-pnpm-install.lock"
if command -v flock &>/dev/null; then
  info "Using flock to prevent concurrent install races..."
  flock -x "$LOCKFILE" pnpm install --no-frozen-lockfile
else
  pnpm install --no-frozen-lockfile
fi

# Verify critical binaries are now available
for bin in tsx vite tsc drizzle-kit; do
  if [ -f "node_modules/.bin/$bin" ]; then
    info "✓ $bin available"
  else
    warn "✗ $bin not found in node_modules/.bin — hoisting may have failed"
  fi
done

# ── 4. Environment check ──────────────────────────────────────────────────────
section "Step 4/4 — Environment"
if [ -z "${DATABASE_URL:-}" ]; then
  warn "DATABASE_URL is not set."
  warn "  • On Replit: add it in the Secrets panel (padlock icon)."
  warn "  • On VPS/Codespace: copy .env.example to .env and fill in the values."
  warn "The API server will start in limited dev mode without it."
else
  info "DATABASE_URL is set ✓"
fi

for var in JWT_SECRET ADMIN_JWT_SECRET; do
  if [ -z "${!var:-}" ]; then
    warn "$var is not set — JWT signing will use a weak fallback in dev mode."
  fi
done

echo ""
echo -e "${GREEN}${BOLD}Setup complete!${NC}"
echo ""
echo "  Start everything:      pnpm --filter @workspace/api-server run dev"
echo "  Start admin panel:     PORT=3000 pnpm --filter @workspace/admin run dev"
echo "  Start vendor app:      PORT=3001 pnpm --filter @workspace/vendor-app run dev"
echo "  Start rider app:       PORT=3002 pnpm --filter @workspace/rider-app run dev"
echo "  Run type-check:        pnpm typecheck"
echo "  Production build:      pnpm build"
echo ""
