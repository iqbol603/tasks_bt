import { Role } from '@prisma/client';
import { prisma } from './prisma.js';

export const PERSONAL_PROJECT_NAME = 'Ежедневные задачи';
export const PERSONAL_PROJECT_COLOR = '#10B981';

const PERSONAL_ROLES: Role[] = [Role.EXECUTOR, Role.OBSERVER];

export function canHavePersonalProject(role: Role): boolean {
  return PERSONAL_ROLES.includes(role);
}

export async function getOrCreatePersonalProject(userId: string, role: Role) {
  if (!canHavePersonalProject(role)) {
    return null;
  }

  const existing = await prisma.project.findFirst({
    where: { creatorId: userId, isPersonal: true },
  });

  if (existing) {
    return existing;
  }

  return prisma.project.create({
    data: {
      name: PERSONAL_PROJECT_NAME,
      description: 'Личные ежедневные задачи',
      color: PERSONAL_PROJECT_COLOR,
      isPersonal: true,
      creatorId: userId,
      members: {
        create: { userId, role },
      },
    },
  });
}

export async function isOwnPersonalProjectTask(
  projectId: string,
  userId: string,
  assigneeId: string | null,
  creatorId: string,
): Promise<boolean> {
  if (assigneeId !== userId || creatorId !== userId) return false;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { isPersonal: true, creatorId: true },
  });

  return !!project?.isPersonal && project.creatorId === userId;
}
