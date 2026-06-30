import { PrismaClient, Role, TaskStatus, TaskPriority, ProjectStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('password123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@rps.local' },
    update: {},
    create: {
      email: 'admin@rps.local',
      passwordHash,
      firstName: 'Админ',
      lastName: 'Системы',
      role: Role.ADMIN,
      department: 'IT',
    },
  });

  const manager = await prisma.user.upsert({
    where: { email: 'manager@rps.local' },
    update: {},
    create: {
      email: 'manager@rps.local',
      passwordHash,
      firstName: 'Иван',
      lastName: 'Петров',
      role: Role.MANAGER,
      department: 'Разработка',
    },
  });

  const executor = await prisma.user.upsert({
    where: { email: 'executor@rps.local' },
    update: {},
    create: {
      email: 'executor@rps.local',
      passwordHash,
      firstName: 'Мария',
      lastName: 'Сидорова',
      role: Role.EXECUTOR,
      department: 'Разработка',
    },
  });

  const project = await prisma.project.upsert({
    where: { id: 'seed-project-1' },
    update: {},
    create: {
      id: 'seed-project-1',
      name: 'RPS Platform',
      description: 'Основной проект корпоративной системы управления задачами',
      color: '#3B82F6',
      status: ProjectStatus.ACTIVE,
      creatorId: admin.id,
      members: {
        create: [
          { userId: admin.id, role: Role.ADMIN },
          { userId: manager.id, role: Role.MANAGER },
          { userId: executor.id, role: Role.EXECUTOR },
        ],
      },
    },
  });

  const tag = await prisma.tag.upsert({
    where: { projectId_name: { projectId: project.id, name: 'MVP' } },
    update: {},
    create: { name: 'MVP', color: '#10B981', projectId: project.id },
  });

  const tasks = [
    {
      id: 'seed-task-1',
      title: 'Настроить инфраструктуру проекта',
      description: 'Docker, MySQL, базовая структура backend и frontend',
      status: TaskStatus.DONE,
      priority: TaskPriority.HIGH,
      assigneeId: admin.id,
      position: 0,
    },
    {
      id: 'seed-task-2',
      title: 'Реализовать модуль авторизации',
      description: 'JWT + Refresh Token, RBAC',
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.HIGH,
      assigneeId: executor.id,
      position: 1,
    },
    {
      id: 'seed-task-3',
      title: 'Создать Kanban-доску',
      description: 'Drag & Drop между статусами',
      status: TaskStatus.TODO,
      priority: TaskPriority.MEDIUM,
      assigneeId: executor.id,
      position: 2,
    },
    {
      id: 'seed-task-4',
      title: 'Dashboard со статистикой',
      description: 'Виджеты: просрочки, мои задачи, статусы',
      status: TaskStatus.REVIEW,
      priority: TaskPriority.MEDIUM,
      assigneeId: manager.id,
      position: 3,
    },
  ];

  for (const task of tasks) {
    await prisma.task.upsert({
      where: { id: task.id },
      update: {},
      create: {
        ...task,
        projectId: project.id,
        creatorId: manager.id,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        tags: { create: [{ tagId: tag.id }] },
        checklists: {
          create: [
            { title: 'Проанализировать ТЗ', isDone: true, position: 0 },
            { title: 'Создать схему БД', isDone: true, position: 1 },
            { title: 'Написать API', isDone: false, position: 2 },
          ],
        },
      },
    });
  }

  await prisma.notification.createMany({
    data: [
      {
        userId: executor.id,
        title: 'Новая задача',
        message: 'Вам назначена задача «Реализовать модуль авторизации»',
        type: 'task_assigned',
        link: '/tasks/seed-task-2',
      },
      {
        userId: manager.id,
        title: 'Задача на проверке',
        message: 'Задача «Dashboard со статистикой» ожидает проверки',
        type: 'task_review',
        link: '/tasks/seed-task-4',
      },
    ],
  });

  console.log('Seed completed:');
  console.log('  admin@rps.local / password123');
  console.log('  manager@rps.local / password123');
  console.log('  executor@rps.local / password123');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
