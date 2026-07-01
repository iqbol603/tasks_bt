import { prisma } from './prisma.js';
import { startOfLocalDay } from './timezone.js';

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
  return startOfLocalDay(d);
}

export function daysAgo(n: number): Date {
  const d = new Date();
  d.setTime(d.getTime() - n * 24 * 60 * 60 * 1000);
  return startOfLocalDay(d);
}
