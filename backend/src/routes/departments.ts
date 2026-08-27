import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate, canManageTeam, type AuthRequest } from '../middleware/auth.js';
import { paramId } from '../lib/params.js';
import { backfillDepartmentsFromUsers } from '../lib/departments.js';
import { assignDepartmentHead } from '../lib/department-head.js';
import { isGlobalViewer, isDepartmentInManagedScope } from '../lib/team-access.js';

const router = Router();
router.use(authenticate);

const departmentInclude = {
  parent: { select: { id: true, name: true } },
  head: { select: { id: true, firstName: true, lastName: true } },
  _count: { select: { users: true, children: true } },
};

const createSchema = z.object({
  name: z.string().min(1).max(120),
  parentId: z.string().optional().nullable(),
  headUserId: z.string().optional().nullable(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  parentId: z.string().optional().nullable(),
  headUserId: z.string().optional().nullable(),
});

router.get('/', async (_req: AuthRequest, res, next) => {
  try {
    await backfillDepartmentsFromUsers();
    const departments = await prisma.department.findMany({
      orderBy: { name: 'asc' },
      include: departmentInclude,
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

    const { name, parentId, headUserId } = createSchema.parse(req.body);
    const trimmed = name.trim();
    if (!trimmed) {
      res.status(400).json({ error: 'Укажите название отдела' });
      return;
    }

    if (parentId && !(await isDepartmentInManagedScope(req.user!.userId, req.user!.role, parentId))) {
      if (!isGlobalViewer(req.user!.role)) {
        res.status(403).json({ error: 'Нельзя создать подотдел в этом отделе' });
        return;
      }
    }

    const existing = await prisma.department.findUnique({ where: { name: trimmed } });
    if (existing) {
      res.status(409).json({ error: 'Отдел с таким названием уже есть' });
      return;
    }

    if (headUserId) {
      const head = await prisma.user.findUnique({ where: { id: headUserId }, select: { id: true } });
      if (!head) {
        res.status(400).json({ error: 'Руководитель отдела не найден' });
        return;
      }
    }

    const created = await prisma.department.create({
      data: {
        name: trimmed,
        parentId: parentId ?? null,
        headUserId: null,
      },
    });

    if (headUserId) {
      await assignDepartmentHead(created.id, headUserId);
    }

    const department = await prisma.department.findUnique({
      where: { id: created.id },
      include: departmentInclude,
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
    const data = updateSchema.parse(req.body);

    if (!isGlobalViewer(req.user!.role)) {
      const canEdit = await isDepartmentInManagedScope(req.user!.userId, req.user!.role, id);
      if (!canEdit) {
        res.status(403).json({ error: 'Недостаточно прав для редактирования этого отдела' });
        return;
      }
    }

    if (data.parentId) {
      if (data.parentId === id) {
        res.status(400).json({ error: 'Отдел не может быть родителем самого себя' });
        return;
      }
      if (!(await isDepartmentInManagedScope(req.user!.userId, req.user!.role, data.parentId))) {
        if (!isGlobalViewer(req.user!.role)) {
          res.status(403).json({ error: 'Нельзя привязать к этому родительскому отделу' });
          return;
        }
      }
    }

    if (data.name) {
      const trimmed = data.name.trim();
      const dup = await prisma.department.findFirst({
        where: { name: trimmed, id: { not: id } },
      });
      if (dup) {
        res.status(409).json({ error: 'Отдел с таким названием уже есть' });
        return;
      }
    }

    if (data.headUserId) {
      const head = await prisma.user.findUnique({ where: { id: data.headUserId }, select: { id: true } });
      if (!head) {
        res.status(400).json({ error: 'Руководитель отдела не найден' });
        return;
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.department.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name.trim() } : {}),
          ...(data.parentId !== undefined ? { parentId: data.parentId } : {}),
        },
      });
      if (data.name !== undefined) {
        await tx.user.updateMany({
          where: { departmentId: id },
          data: { department: data.name.trim() },
        });
      }
    });

    if (data.headUserId !== undefined) {
      await assignDepartmentHead(id, data.headUserId);
    }

    const department = await prisma.department.findUnique({
      where: { id },
      include: departmentInclude,
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

    if (!isGlobalViewer(req.user!.role)) {
      const canEdit = await isDepartmentInManagedScope(req.user!.userId, req.user!.role, id);
      if (!canEdit) {
        res.status(403).json({ error: 'Недостаточно прав для удаления этого отдела' });
        return;
      }
    }

    const usersCount = await prisma.user.count({ where: { departmentId: id } });
    if (usersCount > 0) {
      res.status(400).json({
        error: `Нельзя удалить отдел: в нём ${usersCount} сотрудник(ов). Сначала переназначьте их.`,
      });
      return;
    }

    const childrenCount = await prisma.department.count({ where: { parentId: id } });
    if (childrenCount > 0) {
      res.status(400).json({
        error: `Нельзя удалить отдел: есть ${childrenCount} подотдел(ов). Сначала переназначьте или удалите их.`,
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
