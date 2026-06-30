import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate, type AuthRequest } from '../middleware/auth.js';
import { paramId } from '../lib/params.js';

const router = Router();

router.use(authenticate);

router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json(notifications);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/read', async (req: AuthRequest, res, next) => {
  try {
    const notification = await prisma.notification.updateMany({
      where: { id: paramId(req), userId: req.user!.userId },
      data: { isRead: true },
    });
    if (notification.count === 0) {
      res.status(404).json({ error: 'Уведомление не найдено' });
      return;
    }
    res.json({ message: 'Прочитано' });
  } catch (err) {
    next(err);
  }
});

router.post('/read-all', async (req: AuthRequest, res, next) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user!.userId, isRead: false },
      data: { isRead: true },
    });
    res.json({ message: 'Все уведомления прочитаны' });
  } catch (err) {
    next(err);
  }
});

export default router;
