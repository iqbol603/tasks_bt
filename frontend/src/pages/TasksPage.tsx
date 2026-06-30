import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api } from '../lib/api';
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

export function TasksPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const search = searchParams.get('search') ?? '';
  const [showForm, setShowForm] = useState(false);

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ['tasks', search],
    queryFn: () =>
      api.getTasks({ parentId: 'null', ...(search ? { search } : {}) }) as Promise<Task[]>,
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Задачи</h1>
          <p className="text-muted-foreground">
            {search ? `Результаты поиска: «${search}»` : 'Все задачи'}
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" />
          Новая задача
        </Button>
      </div>

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
