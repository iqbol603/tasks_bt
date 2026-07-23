import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date));
}

export function formatDueDate(date: string | Date | null | undefined): string {
  if (!date) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

export function splitDateTime(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: '', time: '18:00' };
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

export function combineDateTime(date: string, time: string): string | null {
  if (!date) return null;
  const t = time || '18:00';
  return new Date(`${date}T${t}:00`).toISOString();
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

export const STATUS_LABELS: Record<string, string> = {
  BACKLOG: 'Бэклог',
  TODO: 'К выполнению',
  IN_PROGRESS: 'В работе',
  REVIEW: 'На проверке',
  DONE: 'Готово',
  CANCELLED: 'Отменено',
};

export const PRIORITY_LABELS: Record<string, string> = {
  LOW: 'Низкий',
  MEDIUM: 'Средний',
  HIGH: 'Высокий',
  URGENT: 'Срочный',
};

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Администратор',
  MANAGER: 'Руководитель',
  EXECUTOR: 'Исполнитель',
  OBSERVER: 'Наблюдатель',
  HR: 'HR',
  DIRECTOR: 'Директор',
  ASSISTANT_DIRECTOR: 'Помощник директора',
};

/** Директор и помощник директора — одинаковые права. */
export function isDirectorRole(role: string | undefined): boolean {
  return role === 'DIRECTOR' || role === 'ASSISTANT_DIRECTOR';
}

export function isManagerLikeRole(role: string | undefined): boolean {
  return ['ADMIN', 'MANAGER', 'DIRECTOR', 'ASSISTANT_DIRECTOR'].includes(role ?? '');
}

export const PROJECT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Активный',
  ARCHIVED: 'Архив',
  TEMPLATE: 'Шаблон',
};

export const STATUS_COLORS: Record<string, string> = {
  BACKLOG: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  TODO: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  IN_PROGRESS: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  REVIEW: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  DONE: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  CANCELLED: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

export const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'text-slate-500',
  MEDIUM: 'text-blue-500',
  HIGH: 'text-orange-500',
  URGENT: 'text-red-500',
};
