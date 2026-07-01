import type { Request, Response, NextFunction } from 'express';
import type { Role } from '@prisma/client';
import { verifyAccessToken, type TokenPayload } from '../lib/jwt.js';
import { prisma } from '../lib/prisma.js';

export interface AuthRequest extends Request {
  user?: TokenPayload;
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Требуется авторизация' });
    return;
  }

  try {
    const token = header.slice(7);
    req.user = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { isActive: true },
    });

    if (!user?.isActive) {
      res.status(403).json({ error: 'Аккаунт заблокирован. Обратитесь к администратору.' });
      return;
    }

    next();
  } catch {
    res.status(401).json({ error: 'Недействительный или просроченный токен' });
  }
}

const ROLE_HIERARCHY: Record<Role, number> = {
  OBSERVER: 1,
  EXECUTOR: 2,
  HR: 3,
  MANAGER: 4,
  DIRECTOR: 5,
  ADMIN: 6,
};

export function authorize(...roles: Role[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Требуется авторизация' });
      return;
    }

    if (roles.length === 0) {
      next();
      return;
    }

    const userLevel = ROLE_HIERARCHY[req.user.role as Role];
    const minRequired = Math.min(...roles.map((r) => ROLE_HIERARCHY[r]));

    if (userLevel >= minRequired || roles.includes(req.user.role)) {
      next();
      return;
    }

    res.status(403).json({ error: 'Недостаточно прав' });
  };
}

export function canManageUsers(role: Role): boolean {
  return ['ADMIN', 'HR', 'DIRECTOR'].includes(role);
}

export function canManageTeam(role: Role): boolean {
  return ['ADMIN', 'HR', 'DIRECTOR', 'MANAGER'].includes(role);
}

export function canManageProjects(role: Role): boolean {
  return ['ADMIN', 'MANAGER', 'DIRECTOR'].includes(role);
}
