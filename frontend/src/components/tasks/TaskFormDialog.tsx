import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type User } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { STATUS_LABELS, PRIORITY_LABELS, splitDateTime } from '@/lib/utils';

export interface TaskFormData {
  title: string;
  description: string;
  projectId: string;
  assigneeId: string;
  status: string;
  priority: string;
  dueDate: string;
  dueTime: string;
  parentId?: string;
}

interface TaskFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: TaskFormData) => void;
  initial?: Partial<TaskFormData>;
  loading?: boolean;
  title?: string;
}

const STATUSES = ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

export function TaskFormDialog({
  open,
  onClose,
  onSubmit,
  initial,
  loading,
  title = 'Новая задача',
}: TaskFormDialogProps) {
  const { user } = useAuth();
  const isManager = ['ADMIN', 'MANAGER', 'DIRECTOR'].includes(user?.role ?? '');
  const allowedStatuses = isManager
    ? STATUSES
    : STATUSES.filter((s) => s !== 'DONE');

  const [form, setForm] = useState<TaskFormData>({
    title: '',
    description: '',
    projectId: '',
    assigneeId: '',
    status: 'TODO',
    priority: 'MEDIUM',
    dueDate: '',
    dueTime: '18:00',
    ...initial,
  });

  const { data: projects = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['projects'],
    queryFn: () => api.getProjects() as Promise<Array<{ id: string; name: string }>>,
    enabled: open,
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => api.getUsers(),
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      const due = initial?.dueDate
        ? splitDateTime(initial.dueDate.includes('T') ? initial.dueDate : `${initial.dueDate}T12:00:00`)
        : { date: initial?.dueDate ?? '', time: initial?.dueTime ?? '18:00' };
      setForm({
        title: initial?.title ?? '',
        description: initial?.description ?? '',
        projectId: initial?.projectId ?? projects[0]?.id ?? '',
        assigneeId: initial?.assigneeId ?? '',
        status: initial?.status ?? 'TODO',
        priority: initial?.priority ?? 'MEDIUM',
        dueDate: due.date,
        dueTime: initial?.dueTime ?? due.time,
        parentId: initial?.parentId,
      });
    }
  }, [open, initial, projects]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-lg">
        <h2 className="text-lg font-semibold mb-4">{title}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            placeholder="Название задачи *"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />
          <textarea
            placeholder="Описание"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full min-h-[80px] rounded-lg border border-input bg-background px-3 py-2 text-sm resize-y"
          />
          <select
            value={form.projectId}
            onChange={(e) => setForm({ ...form, projectId: e.target.value })}
            className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm"
            required
          >
            <option value="">Выберите проект</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select
            value={form.assigneeId}
            onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}
            className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm"
          >
            <option value="">Без исполнителя</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
            >
              {allowedStatuses.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
            <select
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Срок (дата)</label>
              <Input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Время</label>
              <Input
                type="time"
                value={form.dueTime}
                onChange={(e) => setForm({ ...form, dueTime: e.target.value })}
                disabled={!form.dueDate}
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={onClose}>Отмена</Button>
            <Button type="submit" disabled={!form.title || !form.projectId || loading}>
              {loading ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function useSearchHotkey(onFocus: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        onFocus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onFocus]);
}

export function SearchInput({
  onSearch,
}: {
  onSearch: (q: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useSearchHotkey(() => ref.current?.focus());

  return (
    <input
      ref={ref}
      placeholder="Поиск задач... (Ctrl+K)"
      className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSearch((e.target as HTMLInputElement).value);
      }}
    />
  );
}
