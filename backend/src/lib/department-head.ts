import { prisma } from './prisma.js';

/**
 * Назначает пользователя руководителем отдела и привязывает его к этому отделу.
 * Так руководитель видит только задачи сотрудников своего отдела/подотделов.
 */
export async function assignDepartmentHead(
  departmentId: string,
  headUserId: string | null,
): Promise<void> {
  if (!headUserId) {
    await prisma.department.update({
      where: { id: departmentId },
      data: { headUserId: null },
    });
    return;
  }

  const dept = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { id: true, name: true },
  });
  if (!dept) throw new Error('DEPARTMENT_NOT_FOUND');

  await prisma.$transaction(async (tx) => {
    await tx.department.update({
      where: { id: departmentId },
      data: { headUserId },
    });

    await tx.user.update({
      where: { id: headUserId },
      data: {
        departmentId: dept.id,
        department: dept.name,
      },
    });
  });
}

/** Если создали/обновили MANAGER с отделом — сделать его главой этого отдела */
export async function ensureManagerHeadsDepartment(
  userId: string,
  role: string,
  departmentId: string | null | undefined,
): Promise<void> {
  if (role !== 'MANAGER' || !departmentId) return;

  const dept = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { id: true, name: true, headUserId: true },
  });
  if (!dept) return;

  await prisma.$transaction(async (tx) => {
    await tx.department.update({
      where: { id: departmentId },
      data: { headUserId: userId },
    });
    await tx.user.update({
      where: { id: userId },
      data: {
        departmentId: dept.id,
        department: dept.name,
      },
    });
  });
}
