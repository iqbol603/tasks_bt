import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate, canManageTeam, type AuthRequest } from '../middleware/auth.js';
import { paramId } from '../lib/params.js';
import { backfillDepartmentsFromUsers, resolveDepartmentFields } from '../lib/departments.js';

const router = Router();
router.use(authenticate);

const createSchema = z.object({
  name: z.string().min(1).max(120),
});

const updateSchema = z.object({
  name: z.string().min(1).max(120),
});

router.get('/', async (_req: AuthRequest, res, next) => {
  try {
    await backfillDepartmentsFromUsers();
    const departments = await prisma.department.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { users: true } } },
    });
    res.json(departments);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req: AuthRequest, res, next) => {
  try {
    if (!canManageTeam(req.user!.role)) {
      res.status(403).json({ error: 'Недостаточно прав' });
      return;
    }

    const { name } = createSchema.parse(req.body);
    const trimmed = name.trim();
    if (!trimmed) {
      res.status(400).json({ error: 'Укажите название отдела' });
      return;
    }

    const existing = await prisma.department.findUnique({ where: { name: trimmed } });
    if (existing) {
      res.status(409).json({ error: 'Отдел с таким названием уже есть' });
      return;
    }

    const department = await prisma.department.create({
      data: { name: trimmed },
      include: { _count: { select: { users: true } } },
    });
    res.status(201).json(department);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req: AuthRequest, res, next) => {
  try {
    if (!canManageTeam(req.user!.role)) {
      res.status(403).json({ error: 'Недостаточно прав' });
      return;
    }

    const id = paramId(req);
    const { name } = updateSchema.parse(req.body);
    const trimmed = name.trim();

    const dup = await prisma.department.findFirst({
      where: { name: trimmed, id: { not: id } },
    });
    if (dup) {
      res.status(409).json({ error: 'Отдел с таким названием уже есть' });
      return;
    }

    const department = await prisma.$transaction(async (tx) => {
      const updated = await tx.department.update({
        where: { id },
        data: { name: trimmed },
        include: { _count: { select: { users: true } } },
      });
      await tx.user.updateMany({
        where: { departmentId: id },
        data: { department: trimmed },
      });
      return updated;
    });

    res.json(department);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    if (!canManageTeam(req.user!.role)) {
      res.status(403).json({ error: 'Недостаточно прав' });
      return;
    }

    const id = paramId(req);
    const usersCount = await prisma.user.count({ where: { departmentId: id } });
    if (usersCount > 0) {
      res.status(400).json({
        error: `Нельзя удалить отдел: в нём ${usersCount} сотрудник(ов). Сначала переназначьте их.`,
      });
      return;
    }

    await prisma.department.delete({ where: { id } });
    res.json({ message: 'Отдел удалён' });
  } catch (err) {
    next(err);
  }
});

export default router;
