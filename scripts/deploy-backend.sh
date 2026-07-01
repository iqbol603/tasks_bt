#!/bin/sh
set -e

cd "$(dirname "$0")/../backend"

if [ ! -f .env ]; then
  echo "ERROR: файл backend/.env не найден"
  echo "Создай: cp .env.prod.example .env && nano .env"
  exit 1
fi

DB_URL=$(grep -E '^[[:space:]]*DATABASE_URL=' .env | head -1 | cut -d= -f2- | sed 's/^[[:space:]]*//;s/[[:space:]]*$//;s/^"//;s/"$//;s/^'\''//;s/'\''$//')

if [ -z "$DB_URL" ]; then
  echo "ERROR: DATABASE_URL пустой или закомментирован в backend/.env"
  exit 1
fi

case "$DB_URL" in
  mysql://*) ;;
  *)
    echo "ERROR: DATABASE_URL должен начинаться с mysql://"
    echo "Сейчас: $DB_URL"
    exit 1
    ;;
esac

docker stop tasks_bt_back_cnt 2>/dev/null || true
docker rm tasks_bt_back_cnt 2>/dev/null || true
docker rmi tasks_bt_back_img 2>/dev/null || true

docker build -t tasks_bt_back_img .

docker run --name tasks_bt_back_cnt \
  --restart on-failure \
  --network host \
  --env-file .env \
  -e PORT=6065 \
  -e TZ=Asia/Dushanbe \
  -v tasks_bt_uploads:/app/uploads \
  -d tasks_bt_back_img

sleep 8
echo ""
echo "=== docker ps ==="
docker ps -a | grep tasks_bt_back || true
echo ""
echo "=== logs ==="
docker logs tasks_bt_back_cnt --tail 30 2>&1 || true
echo ""
echo "=== health ==="
curl -sS http://127.0.0.1:6065/health || echo "6065 FAILED"
echo ""
ss -ltnp 2>/dev/null | grep -E '6065|node' || true
