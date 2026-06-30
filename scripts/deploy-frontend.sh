#!/bin/sh
set -e

cd "$(dirname "$0")/../frontend"

docker network create tasks_bt_net 2>/dev/null || true

docker stop tasks_bt_front_cnt 2>/dev/null || true
docker rm tasks_bt_front_cnt 2>/dev/null || true
docker rmi tasks_bt_front_img 2>/dev/null || true

docker build -t tasks_bt_front_img .

docker run --name tasks_bt_front_cnt \
  --restart on-failure \
  --network tasks_bt_net \
  -p 6067:80 \
  -d tasks_bt_front_img

echo "Frontend: http://$(hostname -I | awk '{print $1}'):6067"
