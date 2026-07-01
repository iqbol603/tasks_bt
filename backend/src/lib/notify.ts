import { prisma } from './prisma.js';
import { sendToUser } from './websocket.js';
import { sendEmail, buildNotificationEmail, isEmailConfigured } from './email.js';
import { sendTelegramMessage, formatTelegramNotification, isTelegramConfigured } from './telegram.js';
import { startOfLocalDay } from './timezone.js';

export async function notifyUser(
  userId: string,
  title: string,
  message: string,
  type: string,
  link?: string,
) {
  const notification = await prisma.notification.create({
    data: { userId, title, message, type, link },
  });

  sendToUser(userId, { type: 'notification', notification });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, telegramChatId: true, firstName: true },
  });

  if (!user) return notification;

  if (isEmailConfigured()) {
    sendEmail(
      user.email,
      `[RPS] ${title}`,
      buildNotificationEmail(title, message, link),
    ).catch(() => {});
  }

  if (isTelegramConfigured() && user.telegramChatId) {
    sendTelegramMessage(
      user.telegramChatId,
      formatTelegramNotification(title, message, link),
    ).catch(() => {});
  }

  return notification;
}

export async function wasNotifiedToday(userId: string, type: string, link?: string): Promise<boolean> {
  const startOfToday = startOfLocalDay(new Date());

  const existing = await prisma.notification.findFirst({
    where: {
      userId,
      type,
      ...(link ? { link } : {}),
      createdAt: { gte: startOfToday },
    },
  });

  return !!existing;
}

export async function notifyUserOnceToday(
  userId: string,
  title: string,
  message: string,
  type: string,
  link?: string,
) {
  if (await wasNotifiedToday(userId, type, link)) return null;
  return notifyUser(userId, title, message, type, link);
}

export async function notifyMentionedUsers(
  mentionIds: string[],
  authorId: string,
  taskId: string,
  taskTitle: string,
  authorName: string,
) {
  const unique = [...new Set(mentionIds)].filter((id) => id !== authorId);

  for (const userId of unique) {
    await notifyUser(
      userId,
      'Вас упомянули',
      `${authorName} упомянул вас в комментарии к задаче «${taskTitle}»`,
      'mention',
      `/tasks/${taskId}`,
    );
  }
}

export async function notifyTaskWatchers(
  taskId: string,
  actorId: string,
  title: string,
  message: string,
  type: string,
) {
  const watchers = await prisma.taskWatcher.findMany({
    where: { taskId },
    select: { userId: true },
  });

  const link = `/tasks/${taskId}`;
  const recipients = [...new Set(watchers.map((w) => w.userId))].filter((id) => id !== actorId);

  for (const userId of recipients) {
    await notifyUser(userId, title, message, type, link);
  }
}

export async function notifyTaskStakeholders(
  taskId: string,
  assigneeId: string | null,
  actorId: string,
  title: string,
  message: string,
  type: string,
  oncePerDay = false,
) {
  const link = `/tasks/${taskId}`;
  const recipients = new Set<string>();

  if (assigneeId && assigneeId !== actorId) {
    recipients.add(assigneeId);
  }

  const watchers = await prisma.taskWatcher.findMany({
    where: { taskId },
    select: { userId: true },
  });
  for (const w of watchers) {
    if (w.userId !== actorId) recipients.add(w.userId);
  }

  for (const userId of recipients) {
    if (oncePerDay) {
      await notifyUserOnceToday(userId, title, message, type, link);
    } else {
      await notifyUser(userId, title, message, type, link);
    }
  }
}

export async function notifyManagersForReview(
  projectId: string,
  taskId: string,
  taskTitle: string,
  actorId: string,
  actorName: string,
) {
  const link = `/tasks/${taskId}`;

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

  const recipients = new Set<string>([
    ...globalManagers.map((u) => u.id),
    ...projectManagers.map((m) => m.userId),
  ]);
  recipients.delete(actorId);

  for (const userId of recipients) {
    await notifyUser(
      userId,
      'Задача на проверке',
      `${actorName} отправил задачу «${taskTitle}» на проверку`,
      'task_review',
      link,
    );
  }
}

export async function notifyAssigneeReviewResult(
  assigneeId: string,
  taskId: string,
  taskTitle: string,
  approved: boolean,
  managerName: string,
) {
  const link = `/tasks/${taskId}`;
  if (approved) {
    await notifyUser(
      assigneeId,
      'Задача принята',
      `${managerName} принял вашу задачу «${taskTitle}»`,
      'task_approved',
      link,
    );
  } else {
    await notifyUser(
      assigneeId,
      'Задача возвращена',
      `${managerName} вернул задачу «${taskTitle}» на доработку`,
      'task_rejected',
      link,
    );
  }
}
