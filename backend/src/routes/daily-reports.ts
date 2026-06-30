import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate, type AuthRequest } from '../middleware/auth.js';
import { isManagerRole, startOfDay } from '../lib/activity.js';
import { paramId } from '../lib/params.js';

const router = Router();

router.use(authenticate);

function parseReportDate(value?: string): Date {
  if (value) {
    const d = new Date(`${value}T12:00:00`);
    if (!Number.isNaN(d.getTime())) return startOfDay(d);
  }
  return startOfDay(new Date());
}

const reportSchema = z.object({
  reportDate: z.string().optional(),
  content: z.string().min(1).max(10000),
});

router.get('/my', async (req: AuthRequest, res, next) => {
  try {
    const reportDate = parseReportDate(req.query.date as string | undefined);
    const report = await prisma.dailyReport.findUnique({
      where: {
        userId_reportDate: { userId: req.user!.userId, reportDate },
      },
    });
    res.json(report ?? { reportDate, content: '' });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const reportDate = parseReportDate(req.query.date as string | undefined);
    const userId = req.query.userId as string | undefined;

    if (userId && userId !== req.user!.userId && !isManagerRole(req.user!.role)) {
      res.status(403).json({ error: 'Недостаточно прав' });
      return;
    }

    const where: Record<string, unknown> = { reportDate };
    if (userId) {
      where.userId = userId;
    } else if (!isManagerRole(req.user!.role)) {
      where.userId = req.user!.userId;
    }

    const reports = await prisma.dailyReport.findMany({
      where,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, department: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json(reports);
  } catch (err) {
    next(err);
  }
});

router.get('/history', async (req: AuthRequest, res, next) => {
  try {
    const userId = (req.query.userId as string) || req.user!.userId;
    if (userId !== req.user!.userId && !isManagerRole(req.user!.role)) {
      res.status(403).json({ error: 'Недостаточно прав' });
      return;
    }

    const days = parseInt(String(req.query.days ?? '14'), 10);
    const from = startOfDay(new Date());
    from.setDate(from.getDate() - days);

    const reports = await prisma.dailyReport.findMany({
      where: { userId, reportDate: { gte: from } },
      orderBy: { reportDate: 'desc' },
    });

    res.json(reports);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req: AuthRequest, res, next) => {
  try {
    const data = reportSchema.parse(req.body);
    const reportDate = parseReportDate(data.reportDate);

    const report = await prisma.dailyReport.upsert({
      where: {
        userId_reportDate: { userId: req.user!.userId, reportDate },
      },
      create: {
        userId: req.user!.userId,
        reportDate,
        content: data.content,
      },
      update: { content: data.content },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    res.status(201).json(report);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req: AuthRequest, res, next) => {
  try {
    const id = paramId(req);
    const { content } = reportSchema.parse(req.body);

    const existing = await prisma.dailyReport.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Отчёт не найден' });
      return;
    }

    if (existing.userId !== req.user!.userId && !isManagerRole(req.user!.role)) {
      res.status(403).json({ error: 'Недостаточно прав' });
      return;
    }

    const report = await prisma.dailyReport.update({
      where: { id },
      data: { content },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    res.json(report);
  } catch (err) {
    next(err);
  }
});

export default router;
