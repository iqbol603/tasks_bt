import { Router } from 'express';
import { z } from 'zod';
import { TaskPriority, TaskStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { authenticate, type AuthRequest } from '../middleware/auth.js';
import { getAccessibleProjectIds, logTaskHistory, taskInclude } from '../lib/helpers.js';
import {
  notifyTaskWatchers,
  notifyManagersForReview,
  notifyAssigneeReviewResult,
  notifyTaskAssigned,
} from '../lib/notify.js';
import { logActivity, isManagerRole } from '../lib/activity.js';
import { notifyIfOverdue } from '../lib/deadlines.js';
import { paramId } from '../lib/params.js';
import { formatLocalDateTime, endOfLocalDay, parseLocalDateInput, startOfLocalDay } from '../lib/timezone.js';
import { isOwnPersonalProjectTask } from '../lib/personal-project.js';

const router = Router();

router.use(authenticate);

const createSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  projectId: z.string(),
  assigneeId: z.string().optional().nullable(),
  parentId: z.string().optional().nullable(),
  status: z.nativeEnum(TaskStatus).optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  dueDate: z.string().datetime().optional().nullable(),
  startDate: z.string().datetime().optional().nullable(),
  position: z.number().int().optional(),
});

const updateSchema = createSchema.partial().omit({ projectId: true });

const FIELD_LABELS: Record<string, string> = {
  status: 'Статус',
  assigneeId: 'Исполнитель',
  priority: 'Приоритет',
  title: 'Название',
  dueDate: 'Срок',
};

const STATUS_LABELS: Record<string, string> = {
  BACKLOG: 'Бэклог',
  TODO: 'К выполнению',
  IN_PROGRESS: 'В работе',
  REVIEW: 'На проверке',
  DONE: 'Готово',
  CANCELLED: 'Отменено',
};

const PRIORITY_LABELS: Record<string, string> = {
  LOW: 'Низкий',
  MEDIUM: 'Средний',
  HIGH: 'Высокий',
  URGENT: 'Срочный',
};

function formatDueForNotification(due: Date | null | undefined): string {
  if (!due) return '';
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return '';
  return `\nСрок: ${formatLocalDateTime(d)}`;
}

function formatChangeValue(field: string, val: unknown, task?: { assignee?: { firstName: string; lastName: string } | null }): string {
  if (val == null || val === '') return '—';
  if (field === 'dueDate') {
    return formatLocalDateTime(new Date(String(val)));
  }
  if (field === 'status') return STATUS_LABELS[String(val)] ?? String(val);
  if (field === 'priority') return PRIORITY_LABELS[String(val)] ?? String(val);
  if (field === 'assigneeId' && task?.assignee) {
    return `${task.assignee.firstName} ${task.assignee.lastName}`;
  }
  return String(val);
}

router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const projectIds = await getAccessibleProjectIds(req.user);
    const { status, excludeStatus, projectId, assigneeId, search, parentId, dueDate, dueFrom, dueTo } = req.query;

    const base: Record<string, unknown> = {
      parentId: parentId === 'null' ? null : parentId ?? undefined,
    };

    if (status) {
      base.status = String(status);
    } else if (excludeStatus) {
      const excluded = String(excludeStatus)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (excluded.length) {
        base.status = { notIn: excluded };
      }
    }
    if (assigneeId) base.assigneeId = String(assigneeId);

    if (dueDate) {
      const day = parseLocalDateInput(String(dueDate));
      base.dueDate = { gte: startOfLocalDay(day), lte: endOfLocalDay(day) };
    } else if (dueFrom || dueTo) {
      const range: { gte?: Date; lte?: Date } = {};
      if (dueFrom) range.gte = startOfLocalDay(parseLocalDateInput(String(dueFrom)));
      if (dueTo) range.lte = endOfLocalDay(parseLocalDateInput(String(dueTo)));
      base.dueDate = range;
    }

    const searchWhere = search
      ? {
          OR: [
            { title: { contains: String(search) } },
            { description: { contains: String(search) } },
          ],
        }
      : {};

    // Доступ:
    // - если есть доступ к проекту → видим задачи проекта
    // - если нет доступа к проекту, но сотрудник является наблюдателем → всё равно видим эту задачу
    const accessWhere: Record<string, unknown> = {};
    if (projectIds) {
      if (projectId) {
        if (!projectIds.includes(String(projectId))) {
          res.status(403).json({ error: 'Нет доступа к проекту' });
          return;
        }
        accessWhere.projectId = String(projectId);
      } else {
        accessWhere.OR = [
          { projectId: { in: projectIds } },
          { watchers: { some: { userId: req.user!.userId } } },
        ];
      }
    } else if (projectId) {
      accessWhere.projectId = String(projectId);
    }

    const where: Record<string, unknown> = {
      AND: [base, accessWhere, searchWhere].filter((x) => Object.keys(x).length),
    };

    const tasks = await prisma.task.findMany({
      where,
      include: taskInclude,
      orderBy: [{ position: 'asc' }, { updatedAt: 'desc' }],
    });
    res.json(tasks);
  } catch (err) {
    next(err);
  }
});

router.get('/calendar', async (req: AuthRequest, res, next) => {
  try {
    const projectIds = await getAccessibleProjectIds(req.user);
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(new Date().setDate(1));
    const to = req.query.to
      ? new Date(String(req.query.to))
      : new Date(from.getFullYear(), from.getMonth() + 1, 0, 23, 59, 59);

    const where: Record<string, unknown> = {
      dueDate: { gte: from, lte: to },
      parentId: null,
    };
    if (projectIds) where.projectId = { in: projectIds };

    const tasks = await prisma.task.findMany({
      where,
      include: taskInclude,
      orderBy: { dueDate: 'asc' },
    });

    res.json(tasks);
  } catch (err) {
    next(err);
  }
});

router.get('/kanban', async (req: AuthRequest, res, next) => {
  try {
    const projectIds = await getAccessibleProjectIds(req.user);
    const projectId = req.query.projectId as string | undefined;
    const { assigneeId, priority, search } = req.query;

    if (!projectId) {
      res.status(400).json({ error: 'Укажите projectId' });
      return;
    }

    if (projectIds && !projectIds.includes(projectId)) {
      res.status(403).json({ error: 'Нет доступа к проекту' });
      return;
    }

    const where: Record<string, unknown> = { projectId, parentId: null };
    if (assigneeId) where.assigneeId = String(assigneeId);
    if (priority) where.priority = String(priority);
    if (search) {
      where.OR = [
        { title: { contains: String(search) } },
        { description: { contains: String(search) } },
      ];
    }

    const tasks = await prisma.task.findMany({
      where,
      include: taskInclude,
      orderBy: [{ position: 'asc' }],
    });

    const columns = Object.values(TaskStatus).map((status) => ({
      status,
      tasks: tasks.filter((t) => t.status === status),
    }));

    res.json(columns);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req: AuthRequest, res, next) => {
  try {
    const id = paramId(req);
    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        ...taskInclude,
        subtasks: { include: taskInclude },
        comments: {
          include: {
            author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        files: { orderBy: { uploadedAt: 'desc' } },
        history: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
        watchers: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
    });

    if (!task) {
      res.status(404).json({ error: 'Задача не найдена' });
      return;
    }

    const projectIds = await getAccessibleProjectIds(req.user);
    if (projectIds && !projectIds.includes(task.projectId)) {
      const watcher = await prisma.taskWatcher.findUnique({
        where: { taskId_userId: { taskId: id, userId: req.user!.userId } },
      });
      if (!watcher) {
        res.status(403).json({ error: 'Нет доступа к задаче' });
        return;
      }
    }

    logActivity(req.user!.userId, 'task_view', 'task', id).catch(() => {});

    res.json(task);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req: AuthRequest, res, next) => {
  try {
    const data = createSchema.parse(req.body);
    const isManager = isManagerRole(req.user!.role);

    const projectIds = await getAccessibleProjectIds(req.user);
    if (projectIds && !projectIds.includes(data.projectId)) {
      res.status(403).json({ error: 'Нет доступа к проекту' });
      return;
    }

    const project = await prisma.project.findUnique({
      where: { id: data.projectId },
      select: { isPersonal: true, creatorId: true },
    });
    const isPersonalOwn =
      project?.isPersonal === true && project.creatorId === req.user!.userId;

    if (isPersonalOwn && !data.parentId && !data.assigneeId) {
      data.assigneeId = req.user!.userId;
    }

    // Подзадача обязана иметь выбранного исполнителя (или запрос на исполнителя)
    if (data.parentId && !data.assigneeId) {
      res.status(400).json({ error: 'Для подзадачи обязательно назначить исполнителя' });
      return;
    }

    const needsApproval =
      !isManager && !!data.assigneeId && data.assigneeId !== req.user!.userId;

    const parent = data.parentId
      ? await prisma.task.findUnique({ where: { id: data.parentId }, select: { id: true, title: true } })
      : null;
    if (data.parentId && !parent) {
      res.status(400).json({ error: 'Родительская задача для подзадачи не найдена' });
      return;
    }

    const task = await prisma.task.create({
      data: {
        title: data.title,
        description: data.description,
        projectId: data.projectId,
        assigneeId: needsApproval ? null : data.assigneeId,
        requestedAssigneeId: needsApproval ? data.assigneeId : null,
        isAssignmentApproved: !needsApproval,
        parentId: data.parentId,
        status: data.status ?? TaskStatus.TODO,
        priority: data.priority ?? TaskPriority.MEDIUM,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        startDate: data.startDate ? new Date(data.startDate) : null,
        assignedAt: !needsApproval && data.assigneeId ? new Date() : null,
        position: data.position ?? 0,
        creatorId: req.user!.userId,
      },
      include: taskInclude,
    });

    await logTaskHistory(task.id, req.user!.userId, 'created', undefined, undefined, task.title);

    if (!needsApproval && data.assigneeId && data.assigneeId !== req.user!.userId) {
      await notifyTaskAssigned(
        data.assigneeId,
        task.id,
        parent
          ? `Создана подзадача «${task.title}» для задачи «${parent.title}»${formatDueForNotification(task.dueDate)}`
          : `Вам назначена задача «${task.title}»${formatDueForNotification(task.dueDate)}`,
      );
    }

    if (needsApproval) {
      const actor = await prisma.user.findUnique({ where: { id: req.user!.userId } });
      const actorName = actor ? `${actor.firstName} ${actor.lastName}` : 'Пользователь';
      await notifyManagersForReview(
        task.projectId,
        task.id,
        parent
          ? `Запрос назначения исполнителя: подзадача «${task.title}» для задачи «${parent.title}»${formatDueForNotification(task.dueDate)}`
          : `Запрос назначения исполнителя: «${task.title}»${formatDueForNotification(task.dueDate)}`,
        req.user!.userId,
        actorName,
      );
    }

    res.status(201).json(task);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req: AuthRequest, res, next) => {
  try {
    const id = paramId(req);
    const existing = await prisma.task.findUnique({
      where: { id },
      include: { creator: { select: { id: true, role: true } } },
    });
    if (!existing) {
      res.status(404).json({ error: 'Задача не найдена' });
      return;
    }

    const projectIds = await getAccessibleProjectIds(req.user);
    if (projectIds && !projectIds.includes(existing.projectId)) {
      const watcher = await prisma.taskWatcher.findUnique({
        where: { taskId_userId: { taskId: id, userId: req.user!.userId } },
      });
      if (!watcher) {
        res.status(403).json({ error: 'Нет доступа к задаче' });
        return;
      }
    }

    const data = updateSchema.parse(req.body);
    const isManager = isManagerRole(req.user!.role);
    const userId = req.user!.userId;
    const ownPersonalTask = await isOwnPersonalProjectTask(
      existing.projectId,
      userId,
      existing.assigneeId,
      existing.creatorId,
    );

    if (data.status !== undefined) {
      if (data.status === TaskStatus.DONE && !isManager && !ownPersonalTask) {
        res.status(403).json({ error: 'Исполнитель не может закрыть задачу. Отправьте её на проверку.' });
        return;
      }
      if (data.status === TaskStatus.DONE && existing.status !== TaskStatus.REVIEW && !ownPersonalTask) {
        res.status(400).json({ error: 'Задачу можно закрыть только после проверки (статус «На проверке»)' });
        return;
      }
      if (
        data.status === TaskStatus.REVIEW &&
        existing.status !== TaskStatus.IN_PROGRESS &&
        existing.status !== TaskStatus.REVIEW
      ) {
        res.status(400).json({ error: 'На проверку можно отправить только задачу «В работе»' });
        return;
      }
      if (
        data.status === TaskStatus.IN_PROGRESS &&
        existing.status === TaskStatus.REVIEW &&
        !isManager
      ) {
        res.status(403).json({ error: 'Вернуть задачу с проверки может только руководитель' });
        return;
      }
    }

    const updateData: Record<string, unknown> = { ...data };
    if (data.dueDate !== undefined) updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null;
    if (data.startDate !== undefined) updateData.startDate = data.startDate ? new Date(data.startDate) : null;

    if (data.assigneeId !== undefined && data.assigneeId !== existing.assigneeId) {
      const isSubtask = !!existing.parentId;
      const creatorIsManager = isManagerRole(existing.creator.role);
      // Подзадача: дополнительные правила (кто может менять)
      if (isSubtask) {
        if (creatorIsManager && !isManager) {
          res.status(403).json({ error: 'Исполнителя подзадачи может менять только руководитель/админ' });
          return;
        }
      }

      const isCreator = existing.creatorId === userId;
      const newAssignee = data.assigneeId ? String(data.assigneeId) : null;

      // Не-руководитель не может менять исполнителя чужой задачи/подзадачи
      if (!isManager && !isCreator) {
        res.status(403).json({ error: 'Недостаточно прав для изменения исполнителя' });
        return;
      }

      // Простому сотруднику запрещено назначать другого без одобрения (для задач и подзадач)
      if (!isManager && isCreator && newAssignee && newAssignee !== userId) {
        updateData.assigneeId = null;
        updateData.requestedAssigneeId = newAssignee;
        updateData.isAssignmentApproved = false;
        updateData.assignedAt = null;
        updateData.acceptedAt = null;
      } else {
        updateData.assigneeId = newAssignee;
        updateData.requestedAssigneeId = null;
        updateData.isAssignmentApproved = true;
        updateData.assignedAt = newAssignee ? new Date() : null;
        updateData.acceptedAt = null;
      }
    }

    if (
      data.status === TaskStatus.IN_PROGRESS &&
      existing.status !== TaskStatus.IN_PROGRESS &&
      (existing.assigneeId === userId || isManager)
    ) {
      updateData.acceptedAt = existing.acceptedAt ?? new Date();
    }

    const task = await prisma.task.update({
      where: { id },
      data: updateData,
      include: taskInclude,
    });

    const trackFields = ['status', 'assigneeId', 'priority', 'title', 'dueDate'] as const;
    for (const field of trackFields) {
      const oldVal = existing[field];
      const newVal = data[field];
      if (newVal !== undefined && String(oldVal) !== String(newVal)) {
        await logTaskHistory(
          task.id,
          req.user!.userId,
          'updated',
          field,
          oldVal != null ? String(oldVal) : undefined,
          newVal != null ? String(newVal) : undefined,
        );

        if (field === 'assigneeId') {
          const actualAssignee = task.assigneeId;
          if (actualAssignee && actualAssignee !== oldVal) {
            const parent = task.parentId
              ? await prisma.task.findUnique({ where: { id: task.parentId }, select: { title: true } })
              : null;
            await notifyTaskAssigned(
              actualAssignee,
              task.id,
              parent
                ? `Создана/обновлена подзадача «${task.title}» для задачи «${parent.title}»${formatDueForNotification(task.dueDate)}`
                : `Вам назначена задача «${task.title}»${formatDueForNotification(task.dueDate)}`,
            );
          }
        }

        const label = FIELD_LABELS[field] ?? field;
        const oldText = formatChangeValue(field, oldVal, task);
        const newText = formatChangeValue(field, newVal, task);
        await notifyTaskWatchers(
          task.id,
          req.user!.userId,
          'Задача обновлена',
          `Изменено поле «${label}»: ${oldText} → ${newText} (задача «${task.title}»)`,
          'task_updated',
        );

        if (field === 'status') {
          const actor = await prisma.user.findUnique({ where: { id: userId } });
          const actorName = actor ? `${actor.firstName} ${actor.lastName}` : 'Пользователь';

          if (newVal === TaskStatus.REVIEW && oldVal !== TaskStatus.REVIEW) {
            await notifyManagersForReview(
              task.projectId,
              task.id,
              task.title,
              userId,
              actorName,
            );
          }

          if (oldVal === TaskStatus.REVIEW && newVal === TaskStatus.DONE && task.assigneeId) {
            await notifyAssigneeReviewResult(
              task.assigneeId,
              task.id,
              task.title,
              true,
              actorName,
            );
          }

          if (oldVal === TaskStatus.REVIEW && newVal === TaskStatus.IN_PROGRESS && task.assigneeId) {
            await notifyAssigneeReviewResult(
              task.assigneeId,
              task.id,
              task.title,
              false,
              actorName,
            );
          }
        }
      }
    }

    logActivity(userId, 'task_update', 'task', task.id).catch(() => {});

    const activeStatuses = ['BACKLOG', 'TODO', 'IN_PROGRESS', 'REVIEW'];
    if (task.dueDate && activeStatuses.includes(task.status)) {
      notifyIfOverdue({
        id: task.id,
        title: task.title,
        projectId: task.projectId,
        status: task.status,
        dueDate: task.dueDate,
        assigneeId: task.assigneeId,
        assignee: task.assignee,
      }).catch(() => {});
    }

    res.json(task);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    const id = paramId(req);
    const existing = await prisma.task.findUnique({
      where: { id },
      include: { creator: { select: { id: true, role: true } } },
    });
    if (!existing) {
      res.status(404).json({ error: 'Задача не найдена' });
      return;
    }

    const projectIds = await getAccessibleProjectIds(req.user);
    if (projectIds && !projectIds.includes(existing.projectId)) {
      const watcher = await prisma.taskWatcher.findUnique({
        where: { taskId_userId: { taskId: id, userId: req.user!.userId } },
      });
      if (!watcher) {
        res.status(403).json({ error: 'Нет доступа к задаче' });
        return;
      }
    }

    const isManager = isManagerRole(req.user!.role);
    const isSubtask = !!existing.parentId;
    if (isSubtask) {
      const creatorIsManager = isManagerRole(existing.creator.role);
      const isCreator = existing.creatorId === req.user!.userId;

      if (creatorIsManager && !isManager) {
        res.status(403).json({ error: 'Эту подзадачу может удалить только руководитель/админ' });
        return;
      }

      if (!creatorIsManager && !isCreator && !isManager) {
        res.status(403).json({ error: 'Подзадачу может удалить только создатель или руководитель/админ' });
        return;
      }
    }

    await logTaskHistory(existing.id, req.user!.userId, 'deleted', undefined, existing.title);
    await prisma.task.delete({ where: { id } });
    res.json({ message: 'Задача удалена' });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/approve-assignment', async (req: AuthRequest, res, next) => {
  try {
    if (!isManagerRole(req.user!.role)) {
      res.status(403).json({ error: 'Только руководитель/админ может одобрять назначения' });
      return;
    }

    const id = paramId(req);
    const { approve } = z.object({ approve: z.boolean() }).parse(req.body);

    const existing = await prisma.task.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Задача не найдена' });
      return;
    }
    if (existing.isAssignmentApproved || !existing.requestedAssigneeId) {
      res.status(400).json({ error: 'Нет ожидающего одобрения назначения' });
      return;
    }

    const task = await prisma.task.update({
      where: { id },
      data: approve
        ? {
            assigneeId: existing.requestedAssigneeId,
            requestedAssigneeId: null,
            isAssignmentApproved: true,
            assignedAt: new Date(),
            acceptedAt: null,
          }
        : {
            requestedAssigneeId: null,
            isAssignmentApproved: true,
          },
      include: taskInclude,
    });

    if (approve && existing.requestedAssigneeId) {
      await notifyTaskAssigned(
        existing.requestedAssigneeId,
        task.id,
        `Вам назначена задача «${task.title}»${formatDueForNotification(task.dueDate)}`,
      );
    }

    res.json(task);
  } catch (err) {
    next(err);
  }
});

const checklistSchema = z.object({
  title: z.string().min(1),
  isDone: z.boolean().optional(),
});

router.post('/:id/checklists', async (req: AuthRequest, res, next) => {
  try {
    const id = paramId(req);
    const { title, isDone } = checklistSchema.parse(req.body);
    const count = await prisma.taskChecklist.count({ where: { taskId: id } });

    const item = await prisma.taskChecklist.create({
      data: { taskId: id, title, isDone: isDone ?? false, position: count },
    });
    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/checklists/:checklistId', async (req: AuthRequest, res, next) => {
  try {
    const data = checklistSchema.partial().parse(req.body);
    const item = await prisma.taskChecklist.update({
      where: { id: paramId(req, 'checklistId') },
      data,
    });
    res.json(item);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/watchers', async (req: AuthRequest, res, next) => {
  try {
    const taskId = paramId(req);
    const { userId } = z.object({ userId: z.string() }).parse(req.body);

    const watcher = await prisma.taskWatcher.create({
      data: { taskId, userId },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });
    res.status(201).json(watcher);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/watchers/:userId', async (req: AuthRequest, res, next) => {
  try {
    await prisma.taskWatcher.deleteMany({
      where: { taskId: paramId(req), userId: paramId(req, 'userId') },
    });
    res.json({ message: 'Наблюдатель удалён' });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/tags', async (req: AuthRequest, res, next) => {
  try {
    const taskId = paramId(req);
    const { tagId } = z.object({ tagId: z.string() }).parse(req.body);

    await prisma.taskTag.create({ data: { taskId, tagId } });
    const task = await prisma.task.findUnique({ where: { id: taskId }, include: taskInclude });
    res.json(task);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/tags/:tagId', async (req: AuthRequest, res, next) => {
  try {
    await prisma.taskTag.delete({
      where: { taskId_tagId: { taskId: paramId(req), tagId: paramId(req, 'tagId') } },
    });
    res.json({ message: 'Тег удалён' });
  } catch (err) {
    next(err);
  }
});

export default router;
