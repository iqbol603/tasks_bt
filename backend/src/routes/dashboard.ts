import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticate, type AuthRequest } from '../middleware/auth.js';
import { getAccessibleProjectIds } from '../lib/helpers.js';
import { getTaskAccessWhere } from '../lib/team-access.js';

const router = Router();

router.use(authenticate);

router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const projectIds = await getAccessibleProjectIds(req.user);
    const taskAccess = await getTaskAccessWhere(req.user!);

    const now = new Date();
    const baseWhere = Object.keys(taskAccess).length
      ? { AND: [taskAccess, { parentId: null }] }
      : { parentId: null };

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
      prisma.task.count({ where: baseWhere }),
      prisma.task.count({
        where: {
          AND: [taskAccess, { assigneeId: userId, status: { not: 'DONE' } }].filter(
            (x) => Object.keys(x).length,
          ),
        },
      }),
      prisma.task.count({
        where: {
          AND: [
            taskAccess,
            {
              dueDate: { lt: now },
              status: { notIn: ['DONE', 'CANCELLED'] },
            },
          ].filter((x) => Object.keys(x).length),
        },
      }),
      prisma.task.count({
        where: {
          AND: [
            taskAccess,
            {
              status: 'DONE',
              updatedAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
            },
          ].filter((x) => Object.keys(x).length),
        },
      }),
      prisma.task.groupBy({
        by: ['status'],
        where: baseWhere,
        _count: true,
      }),
      prisma.task.groupBy({
        by: ['priority'],
        where: {
          AND: [taskAccess, { parentId: null, status: { not: 'DONE' } }].filter(
            (x) => Object.keys(x).length,
          ),
        },
        _count: true,
      }),
      prisma.task.findMany({
        where: taskAccess,
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
