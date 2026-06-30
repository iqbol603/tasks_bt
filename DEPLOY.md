# Деплой на VPS (Docker)

Порты:
- **Frontend:** `6067`
- **Backend API:** `6065` (прямой доступ, опционально)
- Через фронт: `http://IP:6067` (API проксируется как `/api`)

## 1. На сервере

```bash
cd /home/marketing
git clone https://github.com/iqbol603/tasks_bt.git
cd tasks_bt
```

## 2. Настрой `.env`

```bash
cp backend/.env.prod.example backend/.env
nano backend/.env
```

Обязательно укажи:
- `DATABASE_URL`
- `JWT_SECRET`, `JWT_REFRESH_SECRET`
- `CORS_ORIGIN=http://ВАШ_IP:6067`
- `APP_URL=http://ВАШ_IP:6067`

## 3. Запуск

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

## 4. Проверка

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f backend
curl http://localhost:6065/health
```

Открой в браузере: `http://ВАШ_IP:6067`

## 5. Обновление после изменений

```bash
cd /home/marketing/tasks_bt
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

## 6. Остановка

```bash
docker compose -f docker-compose.prod.yml down
```
