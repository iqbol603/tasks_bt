import { Router } from 'express';
import { z } from 'zod';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { prisma } from '../lib/prisma.js';
import { authenticate, type AuthRequest } from '../middleware/auth.js';
import { getAccessibleProjectIds } from '../lib/helpers.js';

const router = Router();

router.use(authenticate);

router.get('/summary', async (req: AuthRequest, res, next) => {
  try {
    const projectIds = await getAccessibleProjectIds(req.user);
    const projectFilter = projectIds ? { projectId: { in: projectIds } } : {};

    const [byStatus, byPriority, byAssignee, overdue, totalTime] = await Promise.all([
      prisma.task.groupBy({
        by: ['status'],
        where: { ...projectFilter, parentId: null },
        _count: true,
      }),
      prisma.task.groupBy({
        by: ['priority'],
        where: { ...projectFilter, parentId: null },
        _count: true,
      }),
      prisma.task.groupBy({
        by: ['assigneeId'],
        where: { ...projectFilter, parentId: null, assigneeId: { not: null } },
        _count: true,
      }),
      prisma.task.count({
        where: {
          ...projectFilter,
          dueDate: { lt: new Date() },
          status: { notIn: ['DONE', 'CANCELLED'] },
        },
      }),
      prisma.timeEntry.aggregate({
        where: { task: projectFilter },
        _sum: { duration: true },
      }),
    ]);

    const assigneeIds = byAssignee.map((a) => a.assigneeId!).filter(Boolean);
    const users = await prisma.user.findMany({
      where: { id: { in: assigneeIds } },
      select: { id: true, firstName: true, lastName: true, department: true },
    });

    res.json({
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count })),
      byPriority: byPriority.map((p) => ({ priority: p.priority, count: p._count })),
      byAssignee: byAssignee.map((a) => {
        const user = users.find((u) => u.id === a.assigneeId);
        return {
          assigneeId: a.assigneeId,
          name: user ? `${user.firstName} ${user.lastName}` : 'Неизвестно',
          department: user?.department,
          count: a._count,
        };
      }),
      overdue,
      totalTimeMinutes: totalTime._sum.duration ?? 0,
    });
  } catch (err) {
    next(err);
  }
});

async function fetchReportTasks(req: AuthRequest, projectId?: string) {
  const projectIds = await getAccessibleProjectIds(req.user);
  const where: Record<string, unknown> = { parentId: null };

  if (projectId) {
    if (projectIds && !projectIds.includes(projectId)) throw new Error('FORBIDDEN');
    where.projectId = projectId;
  } else if (projectIds) {
    where.projectId = { in: projectIds };
  }

  return prisma.task.findMany({
    where,
    include: {
      assignee: { select: { firstName: true, lastName: true } },
      project: { select: { name: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });
}

const STATUS_RU: Record<string, string> = {
  BACKLOG: 'Бэклог', TODO: 'К выполнению', IN_PROGRESS: 'В работе',
  REVIEW: 'На проверке', DONE: 'Готово', CANCELLED: 'Отменено',
};

const PRIORITY_RU: Record<string, string> = {
  LOW: 'Низкий', MEDIUM: 'Средний', HIGH: 'Высокий', URGENT: 'Срочный',
};

router.get('/tasks', async (req: AuthRequest, res, next) => {
  try {
    const format = String(req.query.format ?? 'csv');
    const projectId = req.query.projectId ? String(req.query.projectId) : undefined;
    const tasks = await fetchReportTasks(req, projectId);

    const rows = tasks.map((t) => ({
      id: t.id,
      title: t.title,
      project: t.project.name,
      status: STATUS_RU[t.status] ?? t.status,
      priority: PRIORITY_RU[t.priority] ?? t.priority,
      assignee: t.assignee ? `${t.assignee.firstName} ${t.assignee.lastName}` : '',
      dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : '',
      createdAt: t.createdAt.toISOString().slice(0, 10),
    }));

    if (format === 'json') {
      res.json(rows);
      return;
    }

    if (format === 'xlsx') {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Задачи');
      sheet.columns = [
        { header: 'ID', key: 'id', width: 28 },
        { header: 'Название', key: 'title', width: 40 },
        { header: 'Проект', key: 'project', width: 20 },
        { header: 'Статус', key: 'status', width: 15 },
        { header: 'Приоритет', key: 'priority', width: 12 },
        { header: 'Исполнитель', key: 'assignee', width: 20 },
        { header: 'Срок', key: 'dueDate', width: 12 },
        { header: 'Создана', key: 'createdAt', width: 12 },
      ];
      sheet.addRows(rows);
      sheet.getRow(1).font = { bold: true };

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=tasks-report.xlsx');
      await workbook.xlsx.write(res);
      return;
    }

    if (format === 'pdf') {
      const doc = new PDFDocument({ margin: 40 });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=tasks-report.pdf');
      doc.pipe(res);

      doc.fontSize(18).text('Отчёт по задачам', { align: 'center' });
      doc.moveDown();
      doc.fontSize(10);

      for (const row of rows) {
        doc.text(`${row.title} | ${row.project} | ${row.status} | ${row.assignee} | ${row.dueDate}`);
        doc.moveDown(0.3);
      }

      doc.end();
      return;
    }

    // CSV default
    const headers = ['ID', 'Название', 'Проект', 'Статус', 'Приоритет', 'Исполнитель', 'Срок', 'Создана'];
    const csvLines = [
      headers.join(';'),
      ...rows.map((r) =>
        [r.id, r.title, r.project, r.status, r.priority, r.assignee, r.dueDate, r.createdAt]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(';'),
      ),
    ];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=tasks-report.csv');
    res.send('\uFEFF' + csvLines.join('\n'));
  } catch (err) {
    if (err instanceof Error && err.message === 'FORBIDDEN') {
      res.status(403).json({ error: 'Нет доступа' });
      return;
    }
    next(err);
  }
});

export default router;
