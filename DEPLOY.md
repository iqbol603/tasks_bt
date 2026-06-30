# Деплой на VPS (простой Docker)

Порты на сервере:
- **Frontend:** `6067`
- **Backend:** `6065`

> `PORT=6065` в `backend/.env` — это порт **внутри контейнера**.  
> На хосте он проброшен как `6065:6065`, поэтому **не конфликтует** с другими проектами на `3001`.

## 1. Клон и настройка

```bash
cd /home/marketing
git clone https://github.com/iqbol603/tasks_bt.git
cd tasks_bt

cp backend/.env.prod.example backend/.env
nano backend/.env
```

В `.env` обязательно:

```env
PORT=6065
DATABASE_URL="mysql://USER:PASSWORD@127.0.0.1:3306/rps_tasks"
CORS_ORIGIN="http://217.11.176.136:6067"
APP_URL="http://217.11.176.136:6067"
JWT_SECRET="..."
JWT_REFRESH_SECRET="..."
```

> Если MySQL на **этом же сервере**, используй `host.docker.internal` вместо IP.  
> Из Docker `127.0.0.1` и внешний IP часто не работают.

## 2. Запуск (как у online_chat)

```bash
cd /home/marketing/tasks_bt
chmod +x scripts/*.sh
sh scripts/deploy.sh
```

Или по отдельности:

```bash
sh scripts/deploy-backend.sh
sh scripts/deploy-frontend.sh
```

## 3. Ручные команды (без скриптов)

### Backend

```bash
cd /home/marketing/tasks_bt/backend
docker network create tasks_bt_net 2>/dev/null || true
docker stop tasks_bt_back_cnt || true
docker rm tasks_bt_back_cnt || true
docker rmi tasks_bt_back_img || true
docker build -t tasks_bt_back_img .
docker run --name tasks_bt_back_cnt --restart on-failure \
  --network host \
  --env-file .env -v tasks_bt_uploads:/app/uploads \
  -d tasks_bt_back_img
```

### Frontend

```bash
cd /home/marketing/tasks_bt/frontend
docker stop tasks_bt_front_cnt || true
docker rm tasks_bt_front_cnt || true
docker rmi tasks_bt_front_img || true
docker build -t tasks_bt_front_img .
docker run --name tasks_bt_front_cnt --restart on-failure \
  --network tasks_bt_net --add-host=host.docker.internal:host-gateway \
  -p 6067:80 \
  -d tasks_bt_front_img
```

## 4. Проверка

```bash
docker ps | grep tasks_bt
curl http://localhost:6065/health
docker logs tasks_bt_back_cnt
docker logs tasks_bt_front_cnt
```

Браузер: `http://217.11.176.136:6067`

## 5. Обновление

```bash
cd /home/marketing/tasks_bt
git pull
sh scripts/deploy.sh
```

## 6. Остановка

```bash
docker stop tasks_bt_front_cnt tasks_bt_back_cnt
```
