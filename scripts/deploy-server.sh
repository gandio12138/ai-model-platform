#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/ai-model-platform/current}"
BRANCH="${BRANCH:-main}"
ENV_FILE="${ENV_FILE:-/etc/ai-model-platform/ai-model-platform.env}"

cd "$APP_DIR"

git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

pnpm install --frozen-lockfile

sudo bash -lc "set -a; . '$ENV_FILE'; set +a; cd '$APP_DIR'; /usr/bin/pnpm db:migrate"

pnpm --filter @ai-platform/api-server build
VITE_ADMIN_BASE=/admin/ VITE_ROUTER_BASENAME=/admin pnpm --filter @ai-platform/admin-web build
pnpm --filter @ai-platform/checkout-web build

sudo rsync -a --delete apps/admin-web/dist/ /var/www/ai-model-platform/admin/
sudo rsync -a --delete apps/checkout-web/dist/ /var/www/ai-model-platform/checkout/

sudo systemctl restart ai-model-platform-api.service
sudo systemctl reload nginx
sudo systemctl is-active ai-model-platform-api.service
