import { prisma } from './prisma.js';

/** Create Department rows from legacy free-text User.department and link them. */
export async function backfillDepartmentsFromUsers(): Promise<void> {
  const users = await prisma.user.findMany({
    where: {
      departmentId: null,
      department: { not: null },
    },
    select: { id: true, department: true },
  });

  for (const user of users) {
    if (!user.department?.trim()) continue;
    const name = user.department.trim();
    const dept = await prisma.department.upsert({
      where: { name },
      create: { name },
      update: {},
    });
    await prisma.user.update({
      where: { id: user.id },
      data: { departmentId: dept.id, department: name },
    });
  }
}

/** Resolve departmentId + denormalized name for user create/update. */
export async function resolveDepartmentFields(input: {
  departmentId?: string | null;
  department?: string | null;
}): Promise<{ departmentId?: string | null; department?: string | null }> {
  if (input.departmentId !== undefined) {
    if (input.departmentId === null || input.departmentId === '') {
      return { departmentId: null, department: null };
    }
    const dept = await prisma.department.findUnique({ where: { id: input.departmentId } });
    if (!dept) throw new Error('DEPARTMENT_NOT_FOUND');
    return { departmentId: dept.id, department: dept.name };
  }

  if (input.department !== undefined) {
    if (input.department === null || !input.department.trim()) {
      return { departmentId: null, department: null };
    }
    const name = input.department.trim();
    const dept = await prisma.department.upsert({
      where: { name },
      create: { name },
      update: {},
    });
    return { departmentId: dept.id, department: dept.name };
  }

  return {};
}
