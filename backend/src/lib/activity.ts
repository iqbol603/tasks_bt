import { prisma } from './prisma.js';

export async function logActivity(
  userId: string,
  action: string,
  entityType?: string,
  entityId?: string,
) {
  await prisma.userActivityLog.create({
    data: { userId, action, entityType, entityId },
  });
}

export function isManagerRole(role: string): boolean {
  return ['ADMIN', 'MANAGER', 'DIRECTOR'].includes(role);
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return startOfDay(d);
}
