import { prisma } from '../lib/prisma.js';
import type { AuthRequest } from '../middleware/auth.js';
import { notifyUser } from './notify.js';
import {
  getAccessibleProjectIdsForUser,
  isGlobalViewer,
} from './team-access.js';

export { notifyUser as createNotification };

export async function logTaskHistory(
  taskId: string,
  userId: string,
  action: string,
  field?: string,
  oldValue?: string,
  newValue?: string,
) {
  await prisma.taskHistory.create({
    data: { taskId, userId, action, field, oldValue, newValue },
  });
}

export function pickUser(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  role: string;
  department: string | null;
}) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatarUrl,
    role: user.role,
    department: user.department,
  };
}

export const taskInclude = {
  assignee: {
    select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
  },
  creator: {
    select: { id: true, firstName: true, lastName: true, email: true, role: true },
  },
  project: { select: { id: true, name: true, color: true, isPersonal: true } },
  tags: { include: { tag: true } },
  checklists: { orderBy: { position: 'asc' as const } },
  _count: { select: { comments: true, subtasks: true } },
};

/** null = полный доступ (директор, HR, админ); иначе список projectId */
export async function getAccessibleProjectIds(user: AuthRequest['user']): Promise<string[] | null> {
  if (!user) return [];

  if (isGlobalViewer(user.role)) return null;

  return getAccessibleProjectIdsForUser(user);
}
