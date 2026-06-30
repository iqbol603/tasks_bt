#!/bin/sh
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

sh "$ROOT/scripts/deploy-backend.sh"
sh "$ROOT/scripts/deploy-frontend.sh"

echo ""
echo "Готово."
echo "  curl http://localhost:6065/health"
echo "  open http://217.11.176.136:6067"
