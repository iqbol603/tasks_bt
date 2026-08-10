import 'dotenv/config';

process.env.TZ = process.env.TZ ?? 'Asia/Dushanbe';

import http from 'http';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import departmentsRoutes from './routes/departments.js';
import projectsRoutes from './routes/projects.js';
import tasksRoutes from './routes/tasks.js';
import dashboardRoutes from './routes/dashboard.js';
import filesRoutes from './routes/files.js';
import commentsRoutes from './routes/comments.js';
import notificationsRoutes from './routes/notifications.js';
import reportsRoutes from './routes/reports.js';
import timeRoutes from './routes/time.js';
import settingsRoutes from './routes/settings.js';
import analyticsRoutes from './routes/analytics.js';
import dailyReportsRoutes from './routes/daily-reports.js';
import { errorHandler } from './middleware/error.js';
import { initWebSocket } from './lib/websocket.js';
import { initTelegramBot } from './lib/telegram-bot.js';
import { initScheduler } from './lib/scheduler.js';
import { APP_TIMEZONE } from './lib/timezone.js';

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173', credentials: true }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'RPS Task Manager API' });
});

app.use('/auth', authRoutes);
app.use('/users', usersRoutes);
app.use('/departments', departmentsRoutes);
app.use('/projects', projectsRoutes);
app.use('/tasks', tasksRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/files', filesRoutes);
app.use('/comments', commentsRoutes);
app.use('/notifications', notificationsRoutes);
app.use('/reports', reportsRoutes);
app.use('/time', timeRoutes);
app.use('/settings', settingsRoutes);
app.use('/analytics', analyticsRoutes);
app.use('/daily-reports', dailyReportsRoutes);

app.use(errorHandler);

const server = http.createServer(app);
initWebSocket(server);
initTelegramBot();
initScheduler();

server.listen(PORT, () => {
  console.log(`RPS Task Manager API running on http://localhost:${PORT}`);
  console.log(`WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`Timezone: ${APP_TIMEZONE}`);
});
