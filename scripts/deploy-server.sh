#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/ai-model-platform/current}"
BRANCH="${BRANCH:-main}"
ENV_FILE="${ENV_FILE:-/etc/ai-model-platform/ai-model-platform.env}"
ENABLE_SWAP="${ENABLE_SWAP:-true}"
SWAP_FILE="${SWAP_FILE:-/swapfile}"
SWAP_SIZE="${SWAP_SIZE:-2G}"
BUILD_API="${BUILD_API:-true}"
BUILD_ADMIN="${BUILD_ADMIN:-true}"
BUILD_CHECKOUT="${BUILD_CHECKOUT:-true}"
NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=768}"
export NODE_OPTIONS

log() {
  printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

if [[ "$ENABLE_SWAP" == "true" ]] && ! swapon --show | grep -q "$SWAP_FILE"; then
  log "ensuring swap at $SWAP_FILE"
  if [[ ! -f "$SWAP_FILE" ]]; then
    sudo fallocate -l "$SWAP_SIZE" "$SWAP_FILE"
    sudo chmod 600 "$SWAP_FILE"
    sudo mkswap "$SWAP_FILE"
  fi
  sudo swapon "$SWAP_FILE"
fi

cd "$APP_DIR"

log "pulling latest code from origin/$BRANCH"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

log "installing dependencies"
pnpm install --frozen-lockfile

log "running database migrations"
sudo bash -lc "set -a; . '$ENV_FILE'; set +a; cd '$APP_DIR'; /usr/bin/pnpm db:migrate"

if [[ "$BUILD_API" == "true" ]]; then
  log "building api-server"
  pnpm --filter @ai-platform/api-server build
fi

if [[ "$BUILD_ADMIN" == "true" ]]; then
  log "building admin-web"
  VITE_ADMIN_BASE=/admin/ VITE_ROUTER_BASENAME=/admin nice -n 10 pnpm --filter @ai-platform/admin-web build
  sudo rsync -a --delete apps/admin-web/dist/ /var/www/ai-model-platform/admin/
fi

if [[ "$BUILD_CHECKOUT" == "true" ]]; then
  log "building checkout-web"
  nice -n 10 pnpm --filter @ai-platform/checkout-web build
  sudo rsync -a --delete apps/checkout-web/dist/ /var/www/ai-model-platform/checkout/
fi

log "restarting services"
sudo systemctl restart ai-model-platform-api.service
sudo systemctl reload nginx
sudo systemctl is-active ai-model-platform-api.service
