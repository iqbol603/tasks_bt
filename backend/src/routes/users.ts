import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { authenticate, canManageUsers, type AuthRequest } from '../middleware/auth.js';
import { pickUser } from '../lib/helpers.js';
import { paramId } from '../lib/params.js';
import {
  activateUser,
  assertCanModifyUser,
  deactivateUser,
  deleteUserAccount,
  isDeletedUserEmail,
  revokeUserSessions,
} from '../lib/user-management.js';
import { getOrCreatePersonalProject, canHavePersonalProject } from '../lib/personal-project.js';

const router = Router();

router.use(authenticate);

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.nativeEnum(Role).default(Role.EXECUTOR),
  department: z.string().optional(),
});

router.post('/', async (req: AuthRequest, res, next) => {
  try {
    if (!canManageUsers(req.user!.role)) {
      res.status(403).json({ error: 'Только администратор или HR может создавать сотрудников' });
      return;
    }

    const data = createSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      res.status(409).json({ error: 'Пользователь с таким email уже существует' });
      return;
    }

    const passwordHash = await bcrypt.hash(data.password, 10);
    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role,
        department: data.department,
      },
    });

    if (canHavePersonalProject(user.role)) {
      await getOrCreatePersonalProject(user.id, user.role);
    }

    res.status(201).json({
      ...pickUser(user),
      message: 'Сотрудник создан. Попросите его привязать Telegram в Настройках.',
    });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const isAdmin = canManageUsers(req.user!.role);

    if (!isAdmin && req.user!.role !== 'MANAGER') {
      const users = await prisma.user.findMany({
        where: { isActive: true },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
          role: true,
          department: true,
        },
        orderBy: { lastName: 'asc' },
      });
      res.json(users);
      return;
    }

    const users = await prisma.user.findMany({
      where: {
        email: { not: { endsWith: '@removed.local' } },
      },
      orderBy: { lastName: 'asc' },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        role: true,
        department: true,
        isActive: true,
        telegramChatId: true,
        createdAt: true,
      },
    });

    res.json(
      users.map((u) => ({
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        avatarUrl: u.avatarUrl,
        role: u.role,
        department: u.department,
        isActive: u.isActive,
        telegramLinked: !!u.telegramChatId,
        createdAt: u.createdAt,
      })),
    );
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req: AuthRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: paramId(req) },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        role: true,
        department: true,
        isActive: true,
      },
    });
    if (!user) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }
    res.json(user);
  } catch (err) {
    next(err);
  }
});

const updateSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  department: z.string().optional().nullable(),
  role: z.nativeEnum(Role).optional(),
  isActive: z.boolean().optional(),
});

router.patch('/:id', async (req: AuthRequest, res, next) => {
  try {
    const id = paramId(req);
    const isSelf = req.user!.userId === id;
    const isAdmin = canManageUsers(req.user!.role);

    if (!isSelf && !isAdmin) {
      res.status(403).json({ error: 'Недостаточно прав' });
      return;
    }

    const data = updateSchema.parse(req.body);

    if (!isAdmin && (data.role !== undefined || data.isActive !== undefined || data.email || data.password)) {
      res.status(403).json({ error: 'Недостаточно прав для изменения роли, email или пароля' });
      return;
    }

    if (data.email) {
      const dup = await prisma.user.findFirst({ where: { email: data.email, id: { not: id } } });
      if (dup) {
        res.status(409).json({ error: 'Email уже используется' });
        return;
      }
    }

    const { password, ...rest } = data;
    const updateData: Record<string, unknown> = { ...rest };

    if (password) {
      updateData.passwordHash = await bcrypt.hash(password, 10);
    }

    if (data.isActive === false) {
      await revokeUserSessions(id);
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
    });
    res.json(pickUser(user));
  } catch (err) {
    next(err);
  }
});

function handleUserActionError(err: unknown, res: import('express').Response): boolean {
  if (!(err instanceof Error)) return false;

  switch (err.message) {
    case 'SELF':
      res.status(400).json({ error: 'Нельзя выполнить действие над собственным аккаунтом' });
      return true;
    case 'NOT_FOUND':
      res.status(404).json({ error: 'Пользователь не найден' });
      return true;
    case 'DELETED':
      res.status(400).json({ error: 'Сотрудник уже удалён' });
      return true;
    case 'FORBIDDEN':
      res.status(403).json({ error: 'Недостаточно прав для этого сотрудника' });
      return true;
    case 'LAST_ADMIN':
      res.status(400).json({ error: 'Нельзя заблокировать или удалить последнего администратора' });
      return true;
    default:
      return false;
  }
}

router.post('/:id/deactivate', async (req: AuthRequest, res, next) => {
  try {
    if (!canManageUsers(req.user!.role)) {
      res.status(403).json({ error: 'Только администратор или HR может блокировать сотрудников' });
      return;
    }

    const id = paramId(req);
    await assertCanModifyUser(req.user!.userId, req.user!.role as Role, id);
    const user = await deactivateUser(id);

    res.json({ ...pickUser(user), message: 'Сотрудник заблокирован' });
  } catch (err) {
    if (handleUserActionError(err, res)) return;
    next(err);
  }
});

router.post('/:id/activate', async (req: AuthRequest, res, next) => {
  try {
    if (!canManageUsers(req.user!.role)) {
      res.status(403).json({ error: 'Только администратор или HR может разблокировать сотрудников' });
      return;
    }

    const id = paramId(req);
    await assertCanModifyUser(req.user!.userId, req.user!.role as Role, id);
    const user = await activateUser(id);

    res.json({ ...pickUser(user), message: 'Сотрудник разблокирован' });
  } catch (err) {
    if (handleUserActionError(err, res)) return;
    next(err);
  }
});

router.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    if (!canManageUsers(req.user!.role)) {
      res.status(403).json({ error: 'Только администратор или HR может удалять сотрудников' });
      return;
    }

    const id = paramId(req);
    const target = await assertCanModifyUser(req.user!.userId, req.user!.role as Role, id);

    if (isDeletedUserEmail(target.email)) {
      res.status(400).json({ error: 'Сотрудник уже удалён' });
      return;
    }

    await deleteUserAccount(id);

    res.json({ message: 'Сотрудник удалён' });
  } catch (err) {
    if (handleUserActionError(err, res)) return;
    next(err);
  }
});

export default router;
