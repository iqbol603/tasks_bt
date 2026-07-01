import { Router } from 'express';
import multer from 'multer';
import { prisma } from '../lib/prisma.js';
import { authenticate, type AuthRequest } from '../middleware/auth.js';
import { paramId } from '../lib/params.js';
import { storeFile, getFileStream } from '../lib/storage.js';
import { getAccessibleProjectIds } from '../lib/helpers.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const router = Router();

router.use(authenticate);

router.post('/upload', upload.single('file'), async (req: AuthRequest, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Файл не загружен' });
      return;
    }

    const taskId = req.body.taskId as string;
    if (!taskId) {
      res.status(400).json({ error: 'Укажите taskId' });
      return;
    }

    const task = await prisma.task.findUnique({ where: { id: taskId }, select: { projectId: true } });
    if (!task) {
      res.status(404).json({ error: 'Задача не найдена' });
      return;
    }

    const projectIds = await getAccessibleProjectIds(req.user);
    if (projectIds && !projectIds.includes(task.projectId)) {
      const watcher = await prisma.taskWatcher.findUnique({
        where: { taskId_userId: { taskId, userId: req.user!.userId } },
      });
      if (!watcher) {
        res.status(403).json({ error: 'Нет доступа к задаче' });
        return;
      }
    }

    const stored = await storeFile(req.file.buffer, req.file.originalname, req.file.mimetype);

    const existing = await prisma.taskFile.findFirst({
      where: { taskId, originalName: req.file.originalname },
      orderBy: { version: 'desc' },
    });

    const isImage = req.file.mimetype.startsWith('image/');
    const isPdf = req.file.mimetype === 'application/pdf';

    const file = await prisma.taskFile.create({
      data: {
        taskId,
        filename: stored.storageKey,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        path: stored.path,
        version: existing ? existing.version + 1 : 1,
      },
    });

    res.status(201).json({ ...file, previewable: isImage || isPdf });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/download', async (req: AuthRequest, res, next) => {
  try {
    const file = await prisma.taskFile.findUnique({ where: { id: paramId(req) } });
    if (!file) {
      res.status(404).json({ error: 'Файл не найден' });
      return;
    }

    const task = await prisma.task.findUnique({ where: { id: file.taskId }, select: { projectId: true } });
    if (!task) {
      res.status(404).json({ error: 'Задача не найдена' });
      return;
    }

    const projectIds = await getAccessibleProjectIds(req.user);
    if (projectIds && !projectIds.includes(task.projectId)) {
      const watcher = await prisma.taskWatcher.findUnique({
        where: { taskId_userId: { taskId: file.taskId, userId: req.user!.userId } },
      });
      if (!watcher) {
        res.status(403).json({ error: 'Нет доступа к задаче' });
        return;
      }
    }

    const { stream, mimeType } = await getFileStream(file.path);
    res.setHeader('Content-Type', mimeType ?? file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.originalName)}"`);
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/preview', async (req: AuthRequest, res, next) => {
  try {
    const file = await prisma.taskFile.findUnique({ where: { id: paramId(req) } });
    if (!file) {
      res.status(404).json({ error: 'Файл не найден' });
      return;
    }

    const task = await prisma.task.findUnique({ where: { id: file.taskId }, select: { projectId: true } });
    if (!task) {
      res.status(404).json({ error: 'Задача не найдена' });
      return;
    }

    const projectIds = await getAccessibleProjectIds(req.user);
    if (projectIds && !projectIds.includes(task.projectId)) {
      const watcher = await prisma.taskWatcher.findUnique({
        where: { taskId_userId: { taskId: file.taskId, userId: req.user!.userId } },
      });
      if (!watcher) {
        res.status(403).json({ error: 'Нет доступа к задаче' });
        return;
      }
    }

    const previewable =
      file.mimeType.startsWith('image/') || file.mimeType === 'application/pdf';
    if (!previewable) {
      res.status(400).json({ error: 'Предпросмотр недоступен для этого типа файла' });
      return;
    }

    const { stream, mimeType } = await getFileStream(file.path);
    res.setHeader('Content-Type', mimeType ?? file.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.originalName)}"`);
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
});

export default router;
