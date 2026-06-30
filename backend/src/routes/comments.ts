import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate, type AuthRequest } from '../middleware/auth.js';
import { getAccessibleProjectIds } from '../lib/helpers.js';
import { notifyMentionedUsers, notifyTaskWatchers } from '../lib/notify.js';
import { logActivity } from '../lib/activity.js';
import { paramId } from '../lib/params.js';

const router = Router();

router.use(authenticate);

const commentSchema = z.object({
  taskId: z.string(),
  content: z.string().min(1),
  mentionIds: z.array(z.string()).optional(),
});

const updateSchema = z.object({
  content: z.string().min(1),
});

router.get('/task/:taskId', async (req: AuthRequest, res, next) => {
  try {
    const comments = await prisma.taskComment.findMany({
      where: { taskId: paramId(req, 'taskId') },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json(comments);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req: AuthRequest, res, next) => {
  try {
    const { taskId, content, mentionIds } = commentSchema.parse(req.body);

    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      res.status(404).json({ error: 'Задача не найдена' });
      return;
    }

    const projectIds = await getAccessibleProjectIds(req.user);
    if (projectIds && !projectIds.includes(task.projectId)) {
      res.status(403).json({ error: 'Нет доступа' });
      return;
    }

    const comment = await prisma.taskComment.create({
      data: { taskId, content, authorId: req.user!.userId },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
    });

    const author = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    const authorName = author ? `${author.firstName} ${author.lastName}` : 'Пользователь';

    if (mentionIds?.length) {
      await notifyMentionedUsers(mentionIds, req.user!.userId, taskId, task.title, authorName);
    }

    await notifyTaskWatchers(
      taskId,
      req.user!.userId,
      'Новый комментарий',
      `${authorName} оставил комментарий к задаче «${task.title}»`,
      'task_comment',
    );

    logActivity(req.user!.userId, 'comment', 'task', taskId).catch(() => {});

    res.status(201).json(comment);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req: AuthRequest, res, next) => {
  try {
    const { content } = updateSchema.parse(req.body);
    const existing = await prisma.taskComment.findUnique({ where: { id: paramId(req) } });

    if (!existing) {
      res.status(404).json({ error: 'Комментарий не найден' });
      return;
    }

    if (existing.authorId !== req.user!.userId) {
      res.status(403).json({ error: 'Можно редактировать только свои комментарии' });
      return;
    }

    const comment = await prisma.taskComment.update({
      where: { id: paramId(req) },
      data: { content, isEdited: true },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
    });
    res.json(comment);
  } catch (err) {
    next(err);
  }
});

export default router;
