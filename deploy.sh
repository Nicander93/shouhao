#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
git fetch origin main
git reset --hard origin/main
docker compose -f compose.yaml -f compose.prod.yaml up -d --build
docker network connect shouhao_net nginx >/dev/null 2>&1 || true
docker exec nginx nginx -s reload
