import type { Role } from '@prisma/client';
import { prisma } from './prisma.js';
import type { AuthRequest } from '../middleware/auth.js';

/** Полный доступ ко всем задачам и сотрудникам */
export function isGlobalViewer(role: string): boolean {
  return ['ADMIN', 'DIRECTOR', 'ASSISTANT_DIRECTOR', 'HR'].includes(role);
}

export async function getHeadedDepartmentIds(userId: string): Promise<string[]> {
  const headed = await prisma.department.findMany({
    where: { headUserId: userId },
    select: { id: true },
  });
  return headed.map((d) => d.id);
}

/** Все отделы: корневые + все вложенные подотделы */
export async function getDescendantDepartmentIds(rootIds: string[]): Promise<string[]> {
  if (!rootIds.length) return [];

  const all = await prisma.department.findMany({ select: { id: true, parentId: true } });
  const result = new Set<string>(rootIds);
  let changed = true;

  while (changed) {
    changed = false;
    for (const d of all) {
      if (d.parentId && result.has(d.parentId) && !result.has(d.id)) {
        result.add(d.id);
        changed = true;
      }
    }
  }

  return Array.from(result);
}

/**
 * ID сотрудников в зоне ответственности.
 * null = все (директор, HR, админ).
 */
export async function getManagedUserIds(userId: string, role: Role | string): Promise<string[] | null> {
  if (isGlobalViewer(role)) return null;

  if (role === 'MANAGER') {
    const deptIds = await getVisibleDepartmentIds(userId, role);
    if (!deptIds?.length) {
      const directReports = await prisma.user.findMany({
        where: { managerId: userId, isActive: true },
        select: { id: true },
      });
      return Array.from(new Set([userId, ...directReports.map((u) => u.id)]));
    }

    const [usersInDepts, directReports] = await Promise.all([
      prisma.user.findMany({
        where: { departmentId: { in: deptIds }, isActive: true },
        select: { id: true },
      }),
      prisma.user.findMany({
        where: { managerId: userId, isActive: true },
        select: { id: true },
      }),
    ]);

    return Array.from(
      new Set([userId, ...usersInDepts.map((u) => u.id), ...directReports.map((u) => u.id)]),
    );
  }

  return [userId];
}

/** Отделы в зоне видимости руководителя. null = все. */
export async function getVisibleDepartmentIds(
  userId: string,
  role: Role | string,
): Promise<string[] | null> {
  if (isGlobalViewer(role)) return null;

  if (role === 'MANAGER') {
    let headedDeptIds = await getHeadedDepartmentIds(userId);

    if (!headedDeptIds.length) {
      const me = await prisma.user.findUnique({
        where: { id: userId },
        select: { departmentId: true },
      });
      if (me?.departmentId) headedDeptIds = [me.departmentId];
    }

    if (!headedDeptIds.length) return [];
    return getDescendantDepartmentIds(headedDeptIds);
  }

  return [];
}

export async function isUserInManagedScope(
  actorId: string,
  actorRole: Role | string,
  targetUserId: string,
): Promise<boolean> {
  const managed = await getManagedUserIds(actorId, actorRole);
  if (managed === null) return true;
  return managed.includes(targetUserId);
}

export async function isDepartmentInManagedScope(
  actorId: string,
  actorRole: Role | string,
  departmentId: string,
): Promise<boolean> {
  if (isGlobalViewer(actorRole)) return true;

  if (actorRole === 'MANAGER') {
    const allowed = await getVisibleDepartmentIds(actorId, actorRole);
    return !!allowed?.includes(departmentId);
  }

  return false;
}

/** Prisma-фильтр: какие задачи видит пользователь */
export async function getTaskAccessWhere(
  user: NonNullable<AuthRequest['user']>,
): Promise<Record<string, unknown>> {
  if (isGlobalViewer(user.role)) return {};

  const userId = user.userId;

  // Руководитель — только свои + задачи своей команды (не весь проект)
  if (user.role === 'MANAGER') {
    const managedUserIds = await getManagedUserIds(userId, user.role);
    const ids = managedUserIds ?? [userId];
    return {
      OR: [
        { assigneeId: { in: ids } },
        { creatorId: { in: ids } },
        { watchers: { some: { userId } } },
      ],
    };
  }

  const projectIds = await getAccessibleProjectIdsForUser(user);

  const orClauses: Record<string, unknown>[] = [
    { assigneeId: userId },
    { creatorId: userId },
    { watchers: { some: { userId } } },
  ];

  if (projectIds.length) {
    orClauses.push({ projectId: { in: projectIds } });
  }

  return { OR: orClauses };
}

export async function getAccessibleProjectIdsForUser(
  user: NonNullable<AuthRequest['user']>,
): Promise<string[]> {
  if (isGlobalViewer(user.role)) {
    const all = await prisma.project.findMany({ select: { id: true } });
    return all.map((p) => p.id);
  }

  const userId = user.userId;
  const managedUserIds =
    user.role === 'MANAGER' ? await getManagedUserIds(userId, user.role) : [userId];

  const assigneeFilter =
    managedUserIds && managedUserIds.length > 1
      ? { in: managedUserIds }
      : userId;

  const [memberships, created, assignedProjects, teamTaskProjects] = await Promise.all([
    prisma.projectMember.findMany({
      where: { userId },
      select: { projectId: true },
    }),
    prisma.project.findMany({
      where: { creatorId: userId },
      select: { id: true },
    }),
    prisma.task.findMany({
      where: { assigneeId: userId },
      select: { projectId: true },
      distinct: ['projectId'],
    }),
    user.role === 'MANAGER'
      ? prisma.task.findMany({
          where: { assigneeId: assigneeFilter },
          select: { projectId: true },
          distinct: ['projectId'],
        })
      : Promise.resolve([]),
  ]);

  return Array.from(
    new Set([
      ...memberships.map((m) => m.projectId),
      ...created.map((p) => p.id),
      ...assignedProjects.map((t) => t.projectId),
      ...teamTaskProjects.map((t) => t.projectId),
    ]),
  );
}

export async function canAccessTask(
  user: NonNullable<AuthRequest['user']>,
  task: { id: string; projectId: string; assigneeId: string | null; creatorId: string },
): Promise<boolean> {
  if (isGlobalViewer(user.role)) return true;

  const userId = user.userId;
  if (task.assigneeId === userId || task.creatorId === userId) return true;

  const managed = await getManagedUserIds(userId, user.role);
  if (managed) {
    if (task.assigneeId && managed.includes(task.assigneeId)) return true;
    if (managed.includes(task.creatorId)) return true;
  }

  // Руководитель не получает доступ ко всем задачам проекта — только к своей команде
  if (user.role === 'MANAGER') {
    const watcher = await prisma.taskWatcher.findUnique({
      where: { taskId_userId: { taskId: task.id, userId } },
    });
    return !!watcher;
  }

  const projectIds = await getAccessibleProjectIdsForUser(user);
  if (projectIds.includes(task.projectId)) return true;

  const watcher = await prisma.taskWatcher.findUnique({
    where: { taskId_userId: { taskId: task.id, userId } },
  });
  return !!watcher;
}

export async function canAssignToUser(
  actorId: string,
  actorRole: Role | string,
  assigneeId: string,
): Promise<boolean> {
  if (assigneeId === actorId) return true;
  if (isGlobalViewer(actorRole)) return true;
  return isUserInManagedScope(actorId, actorRole, assigneeId);
}
