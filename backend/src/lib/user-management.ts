import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import type { Role, User } from '@prisma/client';
import { prisma } from './prisma.js';

const DELETED_EMAIL_SUFFIX = '@removed.local';

export function isDeletedUserEmail(email: string): boolean {
  return email.endsWith(DELETED_EMAIL_SUFFIX);
}

export async function revokeUserSessions(userId: string): Promise<void> {
  await prisma.refreshToken.deleteMany({ where: { userId } });
}

async function countActiveAdmins(excludeId?: string): Promise<number> {
  return prisma.user.count({
    where: {
      isActive: true,
      role: 'ADMIN',
      email: { not: { endsWith: DELETED_EMAIL_SUFFIX } },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
}

export function canManageTargetUser(actorRole: Role, target: Pick<User, 'role'>): boolean {
  if (actorRole === 'MANAGER') {
    return ['EXECUTOR', 'OBSERVER'].includes(target.role);
  }
  if (target.role === 'DIRECTOR' && actorRole !== 'DIRECTOR') {
    return false;
  }
  if (target.role === 'ADMIN' && !['ADMIN', 'DIRECTOR'].includes(actorRole)) {
    return false;
  }
  if (target.role === 'MANAGER' && !['ADMIN', 'DIRECTOR', 'HR'].includes(actorRole)) {
    return false;
  }
  if (target.role === 'HR' && !['ADMIN', 'DIRECTOR', 'HR'].includes(actorRole)) {
    return false;
  }
  return true;
}

export async function deactivateUser(userId: string): Promise<User> {
  await revokeUserSessions(userId);
  return prisma.user.update({
    where: { id: userId },
    data: { isActive: false },
  });
}

export async function activateUser(userId: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new Error('NOT_FOUND');
  }
  if (isDeletedUserEmail(user.email)) {
    throw new Error('DELETED');
  }

  return prisma.user.update({
    where: { id: userId },
    data: { isActive: true },
  });
}

export async function deleteUserAccount(userId: string): Promise<void> {
  const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);

  await prisma.$transaction(async (tx) => {
    await tx.refreshToken.deleteMany({ where: { userId } });
    await tx.projectMember.deleteMany({ where: { userId } });
    await tx.taskWatcher.deleteMany({ where: { userId } });
    await tx.notification.deleteMany({ where: { userId } });
    await tx.timeEntry.deleteMany({ where: { userId } });
    await tx.task.updateMany({
      where: { assigneeId: userId },
      data: { assigneeId: null },
    });
    await tx.task.updateMany({
      where: { requestedAssigneeId: userId },
      data: { requestedAssigneeId: null, isAssignmentApproved: true },
    });
    await tx.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        email: `deleted.${userId}${DELETED_EMAIL_SUFFIX}`,
        firstName: 'Удалён',
        lastName: 'Сотрудник',
        department: null,
        avatarUrl: null,
        telegramChatId: null,
        telegramLinkCode: null,
        passwordHash,
      },
    });
  });
}

export async function assertCanModifyUser(
  actorId: string,
  actorRole: Role,
  targetId: string,
): Promise<User> {
  if (actorId === targetId) {
    throw new Error('SELF');
  }

  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) {
    throw new Error('NOT_FOUND');
  }

  if (isDeletedUserEmail(target.email)) {
    throw new Error('DELETED');
  }

  if (!canManageTargetUser(actorRole, target)) {
    throw new Error('FORBIDDEN');
  }

  if (target.role === 'ADMIN' && target.isActive) {
    const adminsLeft = await countActiveAdmins(targetId);
    if (adminsLeft === 0) {
      throw new Error('LAST_ADMIN');
    }
  }

  return target;
}
