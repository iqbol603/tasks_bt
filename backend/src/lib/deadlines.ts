import { prisma } from './prisma.js';
import { notifyUserOnceToday } from './notify.js';
import { formatLocalDateTime } from './timezone.js';

async function getManagerIdsForProject(projectId: string): Promise<string[]> {
  const [globalManagers, projectManagers] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true, role: { in: ['ADMIN', 'DIRECTOR'] } },
      select: { id: true },
    }),
    prisma.projectMember.findMany({
      where: { projectId, role: { in: ['MANAGER', 'ADMIN', 'DIRECTOR'] } },
      select: { userId: true },
    }),
  ]);
  return [...new Set([
    ...globalManagers.map((u) => u.id),
    ...projectManagers.map((m) => m.userId),
  ])];
}

export async function notifyIfOverdue(task: {
  id: string;
  title: string;
  projectId: string;
  dueDate: Date | null;
  assigneeId: string | null;
  assignee?: { firstName: string; lastName: string } | null;
  watchers?: { userId: string }[];
}) {
  if (!task.dueDate || task.dueDate.getTime() >= Date.now()) return;

  const link = `/tasks/${task.id}`;
  const dueStr = formatLocalDateTime(task.dueDate);
  const assigneeName = task.assignee
    ? `${task.assignee.firstName} ${task.assignee.lastName}`
    : 'Не назначен';

  const watchers = task.watchers ?? await prisma.taskWatcher.findMany({
    where: { taskId: task.id },
    select: { userId: true },
  });

  const recipients = new Set<string>();
  if (task.assigneeId) recipients.add(task.assigneeId);
  for (const w of watchers) recipients.add(w.userId);

  for (const userId of recipients) {
    await notifyUserOnceToday(
      userId,
      'Задача просрочена',
      `Задача «${task.title}» просрочена (срок был ${dueStr})`,
      'overdue',
      link,
    );
  }

  const managers = await getManagerIdsForProject(task.projectId);
  for (const userId of managers) {
    if (recipients.has(userId)) continue;
    await notifyUserOnceToday(
      userId,
      'Просрочена задача сотрудника',
      `Задача «${task.title}» просрочена (исполнитель: ${assigneeName}, срок был ${dueStr})`,
      'overdue_manager',
      link,
    );
  }
}
