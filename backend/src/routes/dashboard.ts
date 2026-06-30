import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticate, type AuthRequest } from '../middleware/auth.js';
import { getAccessibleProjectIds } from '../lib/helpers.js';

const router = Router();

router.use(authenticate);

router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const projectIds = await getAccessibleProjectIds(req.user);
    const projectFilter = projectIds ? { projectId: { in: projectIds } } : {};

    const now = new Date();

    const [
      totalTasks,
      myTasks,
      overdueTasks,
      completedThisWeek,
      tasksByStatus,
      tasksByPriority,
      recentTasks,
      projectStats,
    ] = await Promise.all([
      prisma.task.count({ where: { ...projectFilter, parentId: null } }),
      prisma.task.count({
        where: { ...projectFilter, assigneeId: userId, status: { not: 'DONE' } },
      }),
      prisma.task.count({
        where: {
          ...projectFilter,
          dueDate: { lt: now },
          status: { notIn: ['DONE', 'CANCELLED'] },
        },
      }),
      prisma.task.count({
        where: {
          ...projectFilter,
          status: 'DONE',
          updatedAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.task.groupBy({
        by: ['status'],
        where: { ...projectFilter, parentId: null },
        _count: true,
      }),
      prisma.task.groupBy({
        by: ['priority'],
        where: { ...projectFilter, parentId: null, status: { not: 'DONE' } },
        _count: true,
      }),
      prisma.task.findMany({
        where: projectFilter,
        include: {
          assignee: { select: { id: true, firstName: true, lastName: true } },
          project: { select: { id: true, name: true, color: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 10,
      }),
      prisma.project.findMany({
        where: projectIds ? { id: { in: projectIds } } : {},
        select: {
          id: true,
          name: true,
          color: true,
          _count: {
            select: {
              tasks: true,
            },
          },
        },
        take: 5,
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    res.json({
      stats: {
        totalTasks,
        myTasks,
        overdueTasks,
        completedThisWeek,
      },
      tasksByStatus: tasksByStatus.map((s) => ({ status: s.status, count: s._count })),
      tasksByPriority: tasksByPriority.map((p) => ({ priority: p.priority, count: p._count })),
      recentTasks,
      projectStats,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
