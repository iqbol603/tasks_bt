import { Router } from 'express';
import { z } from 'zod';
import { ProjectStatus, Role } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { authenticate, canManageProjects, type AuthRequest } from '../middleware/auth.js';
import { getAccessibleProjectIds } from '../lib/helpers.js';
import { paramId } from '../lib/params.js';
import {
  canHavePersonalProject,
  getOrCreatePersonalProject,
  personalProjectVisibilityFilter,
} from '../lib/personal-project.js';

const router = Router();

router.use(authenticate);

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  status: z.nativeEnum(ProjectStatus).optional(),
});

router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const user = req.user!;

    if (canHavePersonalProject(user.role as Role)) {
      await getOrCreatePersonalProject(user.userId, user.role as Role);
    }

    const projectIds = await getAccessibleProjectIds(req.user);
    const status = req.query.status as string | undefined;

    const where: Record<string, unknown> = {
      ...personalProjectVisibilityFilter(user.userId, user.role),
    };
    if (projectIds) where.id = { in: projectIds };
    if (status) where.status = status;

    const projects = await prisma.project.findMany({
      where,
      include: {
        creator: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { tasks: true, members: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    res.json(projects);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req: AuthRequest, res, next) => {
  try {
    const projectIds = await getAccessibleProjectIds(req.user);
    const id = paramId(req);
    if (projectIds && !projectIds.includes(id)) {
      res.status(403).json({ error: 'Нет доступа к проекту' });
      return;
    }

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        creator: { select: { id: true, firstName: true, lastName: true } },
        members: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
          },
        },
        tags: true,
        _count: { select: { tasks: true } },
      },
    });

    if (!project) {
      res.status(404).json({ error: 'Проект не найден' });
      return;
    }
    res.json(project);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req: AuthRequest, res, next) => {
  try {
    if (!canManageProjects(req.user!.role)) {
      res.status(403).json({ error: 'Недостаточно прав для создания проекта' });
      return;
    }

    const data = createSchema.parse(req.body);
    const project = await prisma.project.create({
      data: {
        ...data,
        creatorId: req.user!.userId,
        members: {
          create: { userId: req.user!.userId, role: req.user!.role as Role },
        },
      },
      include: {
        creator: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { tasks: true, members: true } },
      },
    });
    res.status(201).json(project);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req: AuthRequest, res, next) => {
  try {
    if (!canManageProjects(req.user!.role)) {
      res.status(403).json({ error: 'Недостаточно прав для изменения проекта' });
      return;
    }

    const projectIds = await getAccessibleProjectIds(req.user);
    const id = paramId(req);
    if (projectIds && !projectIds.includes(id)) {
      res.status(403).json({ error: 'Нет доступа к проекту' });
      return;
    }

    const data = createSchema.partial().parse(req.body);
    const project = await prisma.project.update({
      where: { id },
      data,
      include: {
        creator: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { tasks: true, members: true } },
      },
    });
    res.json(project);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    if (!canManageProjects(req.user!.role)) {
      res.status(403).json({ error: 'Недостаточно прав' });
      return;
    }

    const id = paramId(req);
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      res.status(404).json({ error: 'Проект не найден' });
      return;
    }
    if (project.isPersonal) {
      res.status(400).json({ error: 'Нельзя удалить личный проект сотрудника' });
      return;
    }

    await prisma.project.delete({ where: { id } });
    res.json({ message: 'Проект удалён' });
  } catch (err) {
    next(err);
  }
});

const memberSchema = z.object({
  userId: z.string(),
  role: z.nativeEnum(Role).optional(),
});

router.post('/:id/members', async (req: AuthRequest, res, next) => {
  try {
    if (!canManageProjects(req.user!.role)) {
      res.status(403).json({ error: 'Недостаточно прав' });
      return;
    }

    const { userId, role } = memberSchema.parse(req.body);
    const member = await prisma.projectMember.create({
      data: {
        projectId: paramId(req),
        userId,
        role: role ?? Role.EXECUTOR,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    res.status(201).json(member);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/tags', async (req: AuthRequest, res, next) => {
  try {
    const tags = await prisma.tag.findMany({ where: { projectId: paramId(req) } });
    res.json(tags);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/tags', async (req: AuthRequest, res, next) => {
  try {
    const { name, color } = z.object({
      name: z.string().min(1),
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    }).parse(req.body);

    const tag = await prisma.tag.create({
      data: { name, color: color ?? '#6B7280', projectId: paramId(req) },
    });
    res.status(201).json(tag);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/archive', async (req: AuthRequest, res, next) => {
  try {
    if (!canManageProjects(req.user!.role)) {
      res.status(403).json({ error: 'Недостаточно прав' });
      return;
    }

    const projectIds = await getAccessibleProjectIds(req.user);
    const id = paramId(req);
    if (projectIds && !projectIds.includes(id)) {
      res.status(403).json({ error: 'Нет доступа к проекту' });
      return;
    }

    const project = await prisma.project.update({
      where: { id },
      data: { status: ProjectStatus.ARCHIVED },
      include: {
        creator: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { tasks: true, members: true } },
      },
    });
    res.json(project);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/unarchive', async (req: AuthRequest, res, next) => {
  try {
    if (!canManageProjects(req.user!.role)) {
      res.status(403).json({ error: 'Недостаточно прав' });
      return;
    }

    const projectIds = await getAccessibleProjectIds(req.user);
    const id = paramId(req);
    if (projectIds && !projectIds.includes(id)) {
      res.status(403).json({ error: 'Нет доступа к проекту' });
      return;
    }

    const project = await prisma.project.update({
      where: { id },
      data: { status: ProjectStatus.ACTIVE },
      include: {
        creator: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { tasks: true, members: true } },
      },
    });
    res.json(project);
  } catch (err) {
    next(err);
  }
});

export default router;
