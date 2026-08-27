import { Router } from 'express';
import { z } from 'zod';
import { TaskStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { authenticate, type AuthRequest } from '../middleware/auth.js';
import { daysAgo, isManagerRole, startOfDay } from '../lib/activity.js';
import { getManagedUserIds, isUserInManagedScope } from '../lib/team-access.js';

const router = Router();

router.use(authenticate);

router.get('/employees', async (req: AuthRequest, res, next) => {
  try {
    if (!isManagerRole(req.user!.role)) {
      res.status(403).json({ error: 'Доступно только руководителям и администраторам' });
      return;
    }

    const since7 = daysAgo(7);
    const since30 = daysAgo(30);
    const now = new Date();

    const managed = await getManagedUserIds(req.user!.userId, req.user!.role);

    const employees = await prisma.user.findMany({
      where: {
        isActive: true,
        role: { in: ['EXECUTOR', 'OBSERVER', 'MANAGER'] },
        ...(managed ? { id: { in: managed } } : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        department: true,
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    const stats = await Promise.all(
      employees.map(async (emp) => {
        const [
          loginCount7d,
          loginCount30d,
          taskViews7d,
          taskUpdates7d,
          comments7d,
          activeTasks,
          completedTasks,
          overdueTasks,
          inReviewTasks,
          lastLogin,
          lastActivity,
          acceptedTasks,
        ] = await Promise.all([
          prisma.userActivityLog.count({
            where: { userId: emp.id, action: 'login', createdAt: { gte: since7 } },
          }),
          prisma.userActivityLog.count({
            where: { userId: emp.id, action: 'login', createdAt: { gte: since30 } },
          }),
          prisma.userActivityLog.count({
            where: { userId: emp.id, action: 'task_view', createdAt: { gte: since7 } },
          }),
          prisma.userActivityLog.count({
            where: { userId: emp.id, action: 'task_update', createdAt: { gte: since7 } },
          }),
          prisma.userActivityLog.count({
            where: { userId: emp.id, action: 'comment', createdAt: { gte: since7 } },
          }),
          prisma.task.count({
            where: { assigneeId: emp.id, status: { notIn: ['DONE', 'CANCELLED'] } },
          }),
          prisma.task.count({
            where: { assigneeId: emp.id, status: 'DONE', updatedAt: { gte: since30 } },
          }),
          prisma.task.count({
            where: {
              assigneeId: emp.id,
              dueDate: { lt: now },
              status: { notIn: ['DONE', 'CANCELLED'] },
            },
          }),
          prisma.task.count({
            where: { assigneeId: emp.id, status: 'REVIEW' },
          }),
          prisma.userActivityLog.findFirst({
            where: { userId: emp.id, action: 'login' },
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true },
          }),
          prisma.userActivityLog.findFirst({
            where: { userId: emp.id },
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true },
          }),
          prisma.task.findMany({
            where: {
              assigneeId: emp.id,
              assignedAt: { not: null },
              acceptedAt: { not: null },
            },
            select: { assignedAt: true, acceptedAt: true },
            take: 50,
            orderBy: { acceptedAt: 'desc' },
          }),
        ]);

        let avgAcceptHours: number | null = null;
        if (acceptedTasks.length) {
          const totalMs = acceptedTasks.reduce((sum, t) => {
            return sum + (t.acceptedAt!.getTime() - t.assignedAt!.getTime());
          }, 0);
          avgAcceptHours = Math.round((totalMs / acceptedTasks.length / 3600000) * 10) / 10;
        }

        const dailyReports7d = await prisma.dailyReport.count({
          where: { userId: emp.id, reportDate: { gte: since7 } },
        });

        return {
          ...emp,
          loginCount7d,
          loginCount30d,
          taskViews7d,
          taskUpdates7d,
          comments7d,
          activeTasks,
          completedTasks,
          overdueTasks,
          inReviewTasks,
          dailyReports7d,
          avgAcceptHours,
          lastLoginAt: lastLogin?.createdAt ?? null,
          lastActivityAt: lastActivity?.createdAt ?? null,
        };
      }),
    );

    res.json(stats);
  } catch (err) {
    next(err);
  }
});

router.get('/employees/:id', async (req: AuthRequest, res, next) => {
  try {
    if (!isManagerRole(req.user!.role)) {
      res.status(403).json({ error: 'Доступно только руководителям и администраторам' });
      return;
    }

    const userId = String(req.params.id);

    if (!(await isUserInManagedScope(req.user!.userId, req.user!.role, userId))) {
      res.status(403).json({ error: 'Нет доступа к аналитике этого сотрудника' });
      return;
    }

    const since30 = daysAgo(30);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        department: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: 'Сотрудник не найден' });
      return;
    }

    const [activity, tasks, reports] = await Promise.all([
      prisma.userActivityLog.findMany({
        where: { userId, createdAt: { gte: since30 } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      prisma.task.findMany({
        where: { assigneeId: userId },
        select: {
          id: true,
          title: true,
          status: true,
          dueDate: true,
          assignedAt: true,
          acceptedAt: true,
          updatedAt: true,
          project: { select: { name: true, color: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      }),
      prisma.dailyReport.findMany({
        where: { userId, reportDate: { gte: since30 } },
        orderBy: { reportDate: 'desc' },
        take: 14,
      }),
    ]);

    res.json({ user, activity, tasks, reports });
  } catch (err) {
    next(err);
  }
});

router.get('/review-queue', async (req: AuthRequest, res, next) => {
  try {
    if (!isManagerRole(req.user!.role)) {
      res.status(403).json({ error: 'Доступно только руководителям и администраторам' });
      return;
    }

    const managed = await getManagedUserIds(req.user!.userId, req.user!.role);

    const tasks = await prisma.task.findMany({
      where: {
        status: TaskStatus.REVIEW,
        parentId: null,
        ...(managed ? { assigneeId: { in: managed } } : {}),
      },
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true } },
        project: { select: { id: true, name: true, color: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json(tasks);
  } catch (err) {
    next(err);
  }
});

export default router;
