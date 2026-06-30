import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate, type AuthRequest } from '../middleware/auth.js';
import { paramId } from '../lib/params.js';

const router = Router();

router.use(authenticate);

router.get('/active', async (req: AuthRequest, res, next) => {
  try {
    const entry = await prisma.timeEntry.findFirst({
      where: { userId: req.user!.userId, endedAt: null },
      include: {
        task: { select: { id: true, title: true, project: { select: { name: true } } } },
      },
    });
    res.json(entry);
  } catch (err) {
    next(err);
  }
});

router.get('/task/:taskId', async (req: AuthRequest, res, next) => {
  try {
    const entries = await prisma.timeEntry.findMany({
      where: { taskId: paramId(req, 'taskId') },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { startedAt: 'desc' },
    });

    const totalMinutes = entries.reduce((sum, e) => sum + (e.duration ?? 0), 0);
    res.json({ entries, totalMinutes });
  } catch (err) {
    next(err);
  }
});

router.post('/task/:taskId/start', async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const taskId = paramId(req, 'taskId');
    const { description } = z.object({ description: z.string().optional() }).parse(req.body);

    const existing = await prisma.timeEntry.findFirst({
      where: { userId, endedAt: null },
    });
    if (existing) {
      res.status(400).json({ error: 'Уже запущен таймер. Остановите его сначала.' });
      return;
    }

    const entry = await prisma.timeEntry.create({
      data: { taskId, userId, description, startedAt: new Date() },
      include: { task: { select: { id: true, title: true } } },
    });
    res.status(201).json(entry);
  } catch (err) {
    next(err);
  }
});

router.post('/task/:taskId/stop', async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const taskId = paramId(req, 'taskId');

    const entry = await prisma.timeEntry.findFirst({
      where: { userId, taskId, endedAt: null },
    });
    if (!entry) {
      res.status(404).json({ error: 'Активный таймер не найден' });
      return;
    }

    const endedAt = new Date();
    const duration = Math.round((endedAt.getTime() - entry.startedAt.getTime()) / 60000);

    const updated = await prisma.timeEntry.update({
      where: { id: entry.id },
      data: { endedAt, duration },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.post('/stop', async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const entry = await prisma.timeEntry.findFirst({ where: { userId, endedAt: null } });
    if (!entry) {
      res.status(404).json({ error: 'Активный таймер не найден' });
      return;
    }

    const endedAt = new Date();
    const duration = Math.round((endedAt.getTime() - entry.startedAt.getTime()) / 60000);

    const updated = await prisma.timeEntry.update({
      where: { id: entry.id },
      data: { endedAt, duration },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

export default router;
