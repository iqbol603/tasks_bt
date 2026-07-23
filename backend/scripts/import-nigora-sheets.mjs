/**
 * Import Nigora's Google Sheets projects/tasks into the DB.
 * Usage: node scripts/import-nigora-sheets.mjs
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { PrismaClient, TaskStatus, TaskPriority, Role } from '@prisma/client';

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(__dirname, 'nigora-import-data.json'), 'utf8'));
const prisma = new PrismaClient();

const STATUS_MAP = {
  TODO: TaskStatus.TODO,
  IN_PROGRESS: TaskStatus.IN_PROGRESS,
  REVIEW: TaskStatus.REVIEW,
  DONE: TaskStatus.DONE,
  CANCELLED: TaskStatus.CANCELLED,
  BACKLOG: TaskStatus.BACKLOG,
};

const PRIORITY_MAP = {
  LOW: TaskPriority.LOW,
  MEDIUM: TaskPriority.MEDIUM,
  HIGH: TaskPriority.HIGH,
  URGENT: TaskPriority.URGENT,
};

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const force = process.argv.includes('--force');

  const assignee = await prisma.user.findUnique({
    where: { email: data.assigneeEmail },
  });
  if (!assignee) {
    throw new Error(`Assignee not found: ${data.assigneeEmail}`);
  }

  const creator =
    (await prisma.user.findFirst({
      where: { role: Role.ADMIN, isActive: true, email: { not: { endsWith: '@removed.local' } } },
      orderBy: { createdAt: 'asc' },
    })) ?? assignee;

  console.log(`Assignee: ${assignee.firstName} ${assignee.lastName} (${assignee.email})`);
  console.log(`Creator:  ${creator.firstName} ${creator.lastName} (${creator.email})`);
  console.log(`Projects: ${data.projects.length}`);
  console.log(`Tasks:    ${data.projects.reduce((n, p) => n + p.tasks.length, 0)}`);

  if (dryRun) {
    console.log('Dry run — nothing written.');
    return;
  }

  let createdProjects = 0;
  let createdTasks = 0;
  let skippedProjects = 0;

  for (const projectData of data.projects) {
    const existing = await prisma.project.findFirst({
      where: { name: projectData.name, isPersonal: false },
      select: { id: true, _count: { select: { tasks: true } } },
    });

    if (existing && existing._count.tasks > 0 && !force) {
      console.log(`SKIP project «${projectData.name}» (already has ${existing._count.tasks} tasks). Use --force to re-import.`);
      skippedProjects += 1;
      continue;
    }

    let projectId = existing?.id;
    if (!projectId) {
      const project = await prisma.project.create({
        data: {
          name: projectData.name,
          description: projectData.description,
          color: projectData.color || '#3B82F6',
          isPersonal: false,
          creatorId: creator.id,
          members: {
            create: [
              { userId: assignee.id, role: assignee.role },
              ...(creator.id !== assignee.id
                ? [{ userId: creator.id, role: creator.role }]
                : []),
            ],
          },
        },
      });
      projectId = project.id;
      createdProjects += 1;
      console.log(`+ project «${project.name}»`);
    } else {
      await prisma.projectMember.upsert({
        where: {
          projectId_userId: { projectId, userId: assignee.id },
        },
        create: { projectId, userId: assignee.id, role: assignee.role },
        update: {},
      });
      console.log(`= reuse project «${projectData.name}»`);
    }

    if (force && existing) {
      await prisma.task.deleteMany({ where: { projectId, creatorId: creator.id } });
    }

    let position = 0;
    for (const t of projectData.tasks) {
      await prisma.task.create({
        data: {
          title: t.title,
          description: t.description || null,
          projectId,
          assigneeId: assignee.id,
          creatorId: creator.id,
          status: STATUS_MAP[t.status] ?? TaskStatus.TODO,
          priority: PRIORITY_MAP[t.priority] ?? TaskPriority.MEDIUM,
          isAssignmentApproved: true,
          assignedAt: new Date(),
          position: position++,
        },
      });
      createdTasks += 1;
    }
    console.log(`  → ${projectData.tasks.length} tasks`);
  }

  console.log('\nDone.');
  console.log({ createdProjects, createdTasks, skippedProjects });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
