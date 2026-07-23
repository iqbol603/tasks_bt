import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PriorityBadge } from '@/components/ui/Badge';
import { TaskFormDialog, type TaskFormData } from '@/components/tasks/TaskFormDialog';
import { STATUS_LABELS, PRIORITY_LABELS, combineDateTime } from '@/lib/utils';

interface KanbanTask {
  id: string;
  title: string;
  priority: string;
  assignee?: { firstName: string; lastName: string };
}

interface KanbanColumn {
  status: string;
  tasks: KanbanTask[];
}

interface Project {
  id: string;
  name: string;
  isPersonal?: boolean;
  creator?: { id: string; firstName: string; lastName: string };
}

interface User {
  id: string;
  firstName: string;
  lastName: string;
}

function toIsoDate(date: string, time: string) {
  return combineDateTime(date, time);
}

export function KanbanPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isManager = ['ADMIN', 'MANAGER', 'DIRECTOR', 'ASSISTANT_DIRECTOR', 'HR'].includes(user?.role ?? '');
  const [projectId, setProjectId] = useState('');
  const [draggedTask, setDraggedTask] = useState<{ id: string; status: string } | null>(null);
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [showForm, setShowForm] = useState(false);

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: () => api.getProjects() as Promise<Project[]>,
  });

  useEffect(() => {
    if (!projectId && projects.length > 0) {
      const team = projects.find((p) => !p.isPersonal);
      const ownPersonal = projects.find((p) => p.isPersonal && p.creator?.id === user?.id);
      setProjectId(
        isManager ? (team?.id ?? projects[0].id) : (ownPersonal?.id ?? projects[0].id),
      );
    }
  }, [projects, projectId, isManager, user?.id]);

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => api.getUsers(),
  });

  const filters: Record<string, string> = {};
  if (assigneeFilter) filters.assigneeId = assigneeFilter;
  if (priorityFilter) filters.priority = priorityFilter;
  if (searchFilter) filters.search = searchFilter;

  const { data: columns = [], isLoading } = useQuery<KanbanColumn[]>({
    queryKey: ['kanban', projectId, assigneeFilter, priorityFilter, searchFilter],
    queryFn: () => api.getKanban(projectId, filters) as Promise<KanbanColumn[]>,
    enabled: !!projectId,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.updateTask(id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kanban', projectId] }),
  });

  const createMutation = useMutation({
    mutationFn: (form: TaskFormData) =>
      api.createTask({
        title: form.title,
        description: form.description || undefined,
        projectId: form.projectId || projectId,
        assigneeId: form.assigneeId || null,
        status: form.status,
        priority: form.priority,
        dueDate: toIsoDate(form.dueDate, form.dueTime),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kanban', projectId] });
      setShowForm(false);
    },
  });

  const activeColumns = columns.filter((c) =>
    ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'].includes(c.status),
  );

  const handleDrop = (status: string) => {
    if (draggedTask && draggedTask.status !== status) {
      updateMutation.mutate({ id: draggedTask.id, status });
    }
    setDraggedTask(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Канбан</h1>
          <p className="text-muted-foreground">Drag & Drop между статусами</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
          >
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
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            Задача
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          placeholder="Поиск..."
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm w-40"
        />
        <select
          value={assigneeFilter}
          onChange={(e) => setAssigneeFilter(e.target.value)}
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
        >
          <option value="">Все исполнители</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
          ))}
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
        >
          <option value="">Все приоритеты</option>
          {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Загрузка...</div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {activeColumns.map((column) => (
            <div
              key={column.status}
              className="min-w-[280px] flex-1"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(column.status)}
            >
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center justify-between">
                    {STATUS_LABELS[column.status]}
                    <span className="text-muted-foreground font-normal">{column.tasks.length}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 min-h-[200px]">
                  {column.tasks.map((task) => (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={() => setDraggedTask({ id: task.id, status: column.status })}
                      className="rounded-lg border border-border bg-background p-3 cursor-grab active:cursor-grabbing hover:shadow-sm transition-shadow"
                    >
                      <Link to={`/tasks/${task.id}`} className="font-medium text-sm hover:underline">
                        {task.title}
                      </Link>
                      <div className="mt-2 flex items-center justify-between">
                        <PriorityBadge priority={task.priority} />
                        {task.assignee && (
                          <span className="text-xs text-muted-foreground">
                            {task.assignee.firstName[0]}{task.assignee.lastName[0]}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}

      <TaskFormDialog
        open={showForm}
        onClose={() => setShowForm(false)}
        initial={{ projectId }}
        onSubmit={(data) => createMutation.mutate(data)}
        loading={createMutation.isPending}
      />
    </div>
  );
}
