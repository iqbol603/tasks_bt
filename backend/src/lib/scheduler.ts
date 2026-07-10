import { TaskStatus } from '@prisma/client';
import { prisma } from './prisma.js';
import { notifyUserOnceToday } from './notify.js';
import { sendEmail, buildDigestEmail, isEmailConfigured } from './email.js';
import { sendTelegramMessage, isTelegramConfigured } from './telegram.js';
import { notifyIfOverdue } from './deadlines.js';
import {
  addLocalDays,
  endOfLocalDay,
  formatLocalDateTime,
  getLocalHour,
  isMorningNotificationWindow,
  isWithinWorkingHours,
  isWorkingDay,
  localDayKey,
  startOfLocalDay,
  DIGEST_HOUR,
  WORK_START_HOUR,
  WORK_END_HOUR,
  APP_TIMEZONE,
} from './timezone.js';

const ACTIVE_STATUSES: TaskStatus[] = [
  TaskStatus.BACKLOG,
  TaskStatus.TODO,
  TaskStatus.IN_PROGRESS,
  TaskStatus.REVIEW,
];

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const DIGEST_ROLES = ['MANAGER', 'ADMIN', 'DIRECTOR'] as const;

let intervalId: ReturnType<typeof setInterval> | null = null;
let running = false;

async function getProjectFilterForUser(userId: string, role: string) {
  if (['ADMIN', 'DIRECTOR', 'HR'].includes(role)) return {};

  const [memberships, created] = await Promise.all([
    prisma.projectMember.findMany({ where: { userId }, select: { projectId: true } }),
    prisma.project.findMany({ where: { creatorId: userId }, select: { id: true } }),
  ]);

  const ids = [...new Set([...memberships.map((m) => m.projectId), ...created.map((p) => p.id)])];
  return ids.length ? { projectId: { in: ids } } : { projectId: { in: [] } };
}

async function runDeadlineChecks() {
  const now = new Date();

  // Суббота и воскресенье — без напоминаний о сроках
  if (!isWorkingDay(now)) return;

  const isMorning = isMorningNotificationWindow(now);
  const tomorrowKey = localDayKey(addLocalDays(now, 1));
  const todayKey = localDayKey(now);

  const tasks = await prisma.task.findMany({
    where: {
      dueDate: { not: null },
      status: { in: ACTIVE_STATUSES },
      parentId: null,
    },
    select: {
      id: true,
      title: true,
      status: true,
      dueDate: true,
      projectId: true,
      assigneeId: true,
      assignee: { select: { firstName: true, lastName: true } },
      watchers: { select: { userId: true } },
    },
  });

  for (const task of tasks) {
    if (!task.dueDate) continue;
    const due = task.dueDate;
    const dueMs = due.getTime();
    const nowMs = now.getTime();
    const dueKey = localDayKey(due);
    const link = `/tasks/${task.id}`;
    const dueStr = formatLocalDateTime(due);

    const recipients = new Set<string>();
    if (task.assigneeId) recipients.add(task.assigneeId);
    for (const w of task.watchers) recipients.add(w.userId);

    if (dueMs < nowMs) {
      // Просрочка — один раз в день в 9:00 (не в полночь)
      if (isMorning) {
        await notifyIfOverdue(task);
      }
      continue;
    }

    if (isMorning && dueKey === tomorrowKey) {
      for (const userId of recipients) {
        await notifyUserOnceToday(
          userId,
          'Срок завтра',
          `У задачи «${task.title}» срок исполнения — завтра (${dueStr})`,
          'due_tomorrow',
          link,
        );
      }
    } else if (isMorning && dueKey === todayKey) {
      for (const userId of recipients) {
        await notifyUserOnceToday(
          userId,
          'Срок сегодня',
          `У задачи «${task.title}» срок исполнения — сегодня (${dueStr})`,
          'due_today',
          link,
        );
      }
    }

    // Напоминание за 1 час до дедлайна — только в рабочее время 9:00–17:00
    if (dueKey === todayKey && isWithinWorkingHours(now)) {
      const msUntilDue = dueMs - nowMs;
      if (msUntilDue > 0 && msUntilDue <= 60 * 60 * 1000) {
        for (const userId of recipients) {
          await notifyUserOnceToday(
            userId,
            'Срок через час',
            `У задачи «${task.title}» срок через час (${dueStr})`,
            'due_soon',
            link,
          );
        }
      }
    }
  }
}

async function runDailyDigest() {
  const now = new Date();
  if (!isWorkingDay(now) || getLocalHour(now) !== DIGEST_HOUR) return;

  const managers = await prisma.user.findMany({
    where: { role: { in: [...DIGEST_ROLES] }, isActive: true },
    select: { id: true, email: true, firstName: true, role: true, telegramChatId: true },
  });

  const weekEnd = endOfLocalDay(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000));
  const todayStart = startOfLocalDay(now);
  const todayEnd = endOfLocalDay(now);

  for (const manager of managers) {
    const projectFilter = await getProjectFilterForUser(manager.id, manager.role);
    const baseWhere = { ...projectFilter, parentId: null };

    const [overdue, dueToday, dueThisWeek, inProgress, overdueList] = await Promise.all([
      prisma.task.count({
        where: {
          ...baseWhere,
          dueDate: { lt: now },
          status: { in: ACTIVE_STATUSES },
        },
      }),
      prisma.task.count({
        where: {
          ...baseWhere,
          dueDate: { gte: todayStart, lte: todayEnd },
          status: { in: ACTIVE_STATUSES },
        },
      }),
      prisma.task.count({
        where: {
          ...baseWhere,
          dueDate: { gte: todayStart, lte: weekEnd },
          status: { in: ACTIVE_STATUSES },
        },
      }),
      prisma.task.count({
        where: { ...baseWhere, status: TaskStatus.IN_PROGRESS },
      }),
      prisma.task.findMany({
        where: {
          ...baseWhere,
          dueDate: { lt: now },
          status: { in: ACTIVE_STATUSES },
        },
        select: {
          id: true,
          title: true,
          dueDate: true,
          assignee: { select: { firstName: true, lastName: true } },
        },
        orderBy: { dueDate: 'asc' },
        take: 5,
      }),
    ]);

    if (overdue === 0 && dueToday === 0 && dueThisWeek === 0 && inProgress === 0) {
      continue;
    }

    const sent = await notifyUserOnceToday(
      manager.id,
      'Ежедневная сводка',
      `Просрочено: ${overdue}\nСрок сегодня: ${dueToday}\nНа этой неделе: ${dueThisWeek}\nВ работе: ${inProgress}`,
      'daily_digest',
      '/dashboard',
    );

    if (!sent) continue;

    const digestHtml = buildDigestEmail({
      firstName: manager.firstName,
      overdue,
      dueToday,
      dueThisWeek,
      inProgress,
      overdueTasks: overdueList.map((t) => ({
        title: t.title,
        dueDate: t.dueDate ? formatLocalDateTime(t.dueDate) : '—',
        assignee: t.assignee ? `${t.assignee.firstName} ${t.assignee.lastName}` : 'Не назначен',
        link: `/tasks/${t.id}`,
      })),
    });

    if (isEmailConfigured()) {
      sendEmail(manager.email, '[RPS] Ежедневная сводка', digestHtml).catch(() => {});
    }

    if (isTelegramConfigured() && manager.telegramChatId) {
      const lines = [
        `<b>Ежедневная сводка</b>`,
        `Просрочено: ${overdue}`,
        `Срок сегодня: ${dueToday}`,
        `На этой неделе: ${dueThisWeek}`,
        `В работе: ${inProgress}`,
      ];
      if (overdueList.length) {
        lines.push('', '<b>Просроченные:</b>');
        const appUrl = process.env.APP_URL ?? 'http://localhost:5173';
        for (const t of overdueList) {
          lines.push(`• <a href="${appUrl}/tasks/${t.id}">${t.title}</a>`);
        }
      }
      sendTelegramMessage(manager.telegramChatId, lines.join('\n')).catch(() => {});
    }
  }
}

async function tick() {
  if (running) return;
  running = true;
  try {
    await runDeadlineChecks();
    await runDailyDigest();
  } catch (err) {
    console.error('Scheduler error:', err);
  } finally {
    running = false;
  }
}

export function initScheduler() {
  if (process.env.SCHEDULER_ENABLED === 'false') {
    console.log('Scheduler disabled (SCHEDULER_ENABLED=false)');
    return;
  }

  tick();
  intervalId = setInterval(tick, CHECK_INTERVAL_MS);
  console.log(
    `Scheduler started (every ${CHECK_INTERVAL_MS / 60000} min, work ${WORK_START_HOUR}:00–${WORK_END_HOUR}:00, digest at ${DIGEST_HOUR}:00 ${APP_TIMEZONE}, Mon–Fri)`,
  );
}

export function stopScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
