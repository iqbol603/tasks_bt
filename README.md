# tasks_bt

> Repo: `iqbol603/tasks_bt`

## RPS Task Manager

Корпоративная система управления задачами (MVP — Этап 1 по ТЗ).

## Стек

| Слой | Технологии |
|------|------------|
| Frontend | React, TypeScript, Vite, Tailwind CSS |
| Backend | Node.js, Express, Prisma |
| БД | MySQL 8 |
| Auth | JWT + Refresh Token, RBAC |

## Быстрый старт

### 1. Запуск MySQL

```bash
docker compose up -d
```

### 2. Backend

```bash
cd backend
cp .env.example .env
npm install
npm run db:push
npm run db:seed
npm run dev
```

API: http://localhost:3001

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Приложение: http://localhost:5173

## Демо-аккаунты

| Email | Пароль | Роль |
|-------|--------|------|
| admin@rps.local | password123 | Администратор |
| manager@rps.local | password123 | Руководитель |
| executor@rps.local | password123 | Исполнитель |

## Реализовано (MVP)

- Авторизация JWT + Refresh Token
- RBAC (6 ролей)
- Модули: Auth, Users, Projects, Tasks, Comments, Files, Notifications, Dashboard
- Dashboard со статистикой
- Список задач с поиском
- Канбан с Drag & Drop
- Карточка задачи: описание, чек-лист, комментарии, история (audit log)
- Загрузка файлов к задачам
- Уведомления
- Тёмная / светлая тема
- Адаптивный UI с боковым меню

## API

| Метод | Endpoint | Описание |
|-------|----------|----------|
| POST | `/auth/login` | Вход |
| POST | `/auth/refresh` | Обновление токена |
| GET | `/dashboard` | Статистика |
| GET/POST | `/projects` | Проекты |
| GET/POST/PUT/DELETE | `/tasks` | Задачи |
| GET | `/tasks/kanban` | Канбан |
| POST | `/comments` | Комментарии |
| POST | `/files/upload` | Загрузка файлов |
| GET | `/notifications` | Уведомления |

## Дорожная карта

- **Этап 2**: Отчёты (Excel, PDF, CSV), календарь, аналитика
- **Этап 3**: Telegram Bot, Push-уведомления, WebSocket
- **Этап 4**: AI-функции
- **Этап 5**: Мобильные приложения
