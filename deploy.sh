#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
git fetch origin main
git reset --hard origin/main
exec docker compose up -d --build
