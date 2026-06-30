#!/bin/sh
set -e

cd "$(dirname "$0")/../backend"

docker network create tasks_bt_net 2>/dev/null || true

docker stop tasks_bt_back_cnt 2>/dev/null || true
docker rm tasks_bt_back_cnt 2>/dev/null || true
docker rmi tasks_bt_back_img 2>/dev/null || true

docker build -t tasks_bt_back_img .

docker run --name tasks_bt_back_cnt \
  --restart on-failure \
  --network tasks_bt_net \
  --add-host=host.docker.internal:host-gateway \
  -p 6065:6065 \
  --env-file .env \
  -v tasks_bt_uploads:/app/uploads \
  -d tasks_bt_back_img

echo "Backend: http://$(hostname -I | awk '{print $1}'):6065/health"
