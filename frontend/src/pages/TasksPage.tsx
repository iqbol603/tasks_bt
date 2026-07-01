import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, X } from 'lucide-react';
import { api, type User } from '../lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { StatusBadge, PriorityBadge } from '@/components/ui/Badge';
import { TaskFormDialog, type TaskFormData } from '@/components/tasks/TaskFormDialog';
import { formatDueDate, combineDateTime } from '@/lib/utils';

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  project: { name: string; color: string };
  assignee?: { firstName: string; lastName: string };
}

interface ProjectOption {
  id: string;
  name: string;
  isPersonal?: boolean;
  creator?: { firstName: string; lastName: string };
}

export function TasksPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const search = searchParams.get('search') ?? '';
  const [showForm, setShowForm] = useState(false);
  const [projectFilter, setProjectFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [dueDateFilter, setDueDateFilter] = useState('');

  const canFilter = ['ADMIN', 'MANAGER', 'DIRECTOR', 'HR'].includes(user?.role ?? '');

  const { data: projects = [] } = useQuery<ProjectOption[]>({
    queryKey: ['projects'],
    queryFn: () => api.getProjects() as Promise<ProjectOption[]>,
    enabled: canFilter,
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => api.getUsers(),
    enabled: canFilter,
  });

  const taskParams: Record<string, string> = { parentId: 'null' };
  if (search) taskParams.search = search;
  if (projectFilter) taskParams.projectId = projectFilter;
  if (assigneeFilter) taskParams.assigneeId = assigneeFilter;
  if (dueDateFilter) taskParams.dueDate = dueDateFilter;

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ['tasks', search, projectFilter, assigneeFilter, dueDateFilter],
    queryFn: () => api.getTasks(taskParams) as Promise<Task[]>,
  });

  const createMutation = useMutation({
    mutationFn: (form: TaskFormData) =>
      api.createTask({
        title: form.title,
        description: form.description || undefined,
        projectId: form.projectId,
        assigneeId: form.assigneeId || null,
        status: form.status,
        priority: form.priority,
        dueDate: combineDateTime(form.dueDate, form.dueTime),
      }),
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setShowForm(false);
      navigate(`/tasks/${(task as { id: string }).id}`);
    },
  });

  const hasFilters = !!(projectFilter || assigneeFilter || dueDateFilter);
  const selectedProject = projects.find((p) => p.id === projectFilter);
  const selectedUser = users.find((u) => u.id === assigneeFilter);
  const dueDateLabel = dueDateFilter
    ? new Date(`${dueDateFilter}T12:00:00`).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

  const subtitle = search
    ? `Результаты поиска: «${search}»`
    : hasFilters
      ? [
          selectedProject?.name,
          selectedUser ? `${selectedUser.firstName} ${selectedUser.lastName}` : null,
          dueDateLabel ? `срок ${dueDateLabel}` : null,
        ].filter(Boolean).join(' · ') || 'Отфильтрованный список'
      : 'Все задачи';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Задачи</h1>
          <p className="text-muted-foreground">{subtitle}</p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" />
          Новая задача
        </Button>
      </div>

      {canFilter && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm min-w-[180px]"
          >
            <option value="">Все проекты</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.isPersonal && p.creator
                  ? ` (${p.creator.firstName} ${p.creator.lastName})`
                  : p.isPersonal
                    ? ' (личный)'
                    : ''}
              </option>
            ))}
          </select>
          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm min-w-[180px]"
          >
            <option value="">Все сотрудники</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.firstName} {u.lastName}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={dueDateFilter}
            onChange={(e) => setDueDateFilter(e.target.value)}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
            title="Срок (дата)"
          />
          {hasFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setProjectFilter('');
                setAssigneeFilter('');
                setDueDateFilter('');
              }}
            >
              <X className="h-4 w-4" />
              Сбросить
            </Button>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="text-muted-foreground">Загрузка...</div>
      ) : tasks.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">Задачи не найдены</CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <Link key={task.id} to={`/tasks/${task.id}`}>
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: task.project.color }} />
                      <span className="text-xs text-muted-foreground">{task.project.name}</span>
                    </div>
                    <p className="font-medium">{task.title}</p>
                    {task.assignee && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {task.assignee.firstName} {task.assignee.lastName}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 ml-4 shrink-0">
                    <PriorityBadge priority={task.priority} />
                    <span className="text-xs text-muted-foreground hidden md:block">
                      {formatDueDate(task.dueDate)}
                    </span>
                    <StatusBadge status={task.status} />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <TaskFormDialog
        open={showForm}
        onClose={() => setShowForm(false)}
        onSubmit={(data) => createMutation.mutate(data)}
        loading={createMutation.isPending}
      />
    </div>
  );
}
