import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ListTodo, FolderOpen } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/Badge';
import { formatDueDate } from '@/lib/utils';

interface DashboardData {
  stats: {
    totalTasks: number;
    myTasks: number;
    overdueTasks: number;
    completedThisWeek: number;
  };
  tasksByStatus: { status: string; count: number }[];
  tasksByPriority: { priority: string; count: number }[];
  recentTasks: Array<{
    id: string;
    title: string;
    status: string;
    dueDate: string | null;
    project: { name: string; color: string };
    assignee?: { firstName: string; lastName: string };
  }>;
  projectStats: Array<{
    id: string;
    name: string;
    color: string;
    _count: { tasks: number };
  }>;
}

const statCards = [
  { key: 'totalTasks', label: 'Всего задач', icon: ListTodo, color: 'text-blue-500' },
  { key: 'myTasks', label: 'Мои задачи', icon: FolderOpen, color: 'text-indigo-500' },
  { key: 'overdueTasks', label: 'Просрочено', icon: AlertTriangle, color: 'text-red-500' },
  { key: 'completedThisWeek', label: 'Завершено за неделю', icon: CheckCircle2, color: 'text-green-500' },
] as const;

export function DashboardPage() {
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: () => api.getDashboard() as Promise<DashboardData>,
  });

  if (isLoading) {
    return <div className="text-muted-foreground">Загрузка dashboard...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Обзор задач и проектов</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map(({ key, label, icon: Icon, color }) => (
          <Card key={key}>
            <CardContent className="flex items-center gap-4 p-6">
              <div className={`rounded-lg bg-accent p-3 ${color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="text-2xl font-bold">{data?.stats[key] ?? 0}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Задачи по статусам</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data?.tasksByStatus.map((item) => (
              <div key={item.status} className="flex items-center justify-between">
                <StatusBadge status={item.status} />
                <span className="font-medium">{item.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Проекты</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data?.projectStats.map((project) => (
              <Link
                key={project.id}
                to={`/projects`}
                className="flex items-center justify-between rounded-lg p-2 hover:bg-accent transition-colors"
              >
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: project.color }} />
                  <span className="font-medium">{project.name}</span>
                </div>
                <span className="text-sm text-muted-foreground">{project._count.tasks} задач</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Последние задачи</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {data?.recentTasks.map((task) => (
              <Link
                key={task.id}
                to={`/tasks/${task.id}`}
                className="flex items-center justify-between rounded-lg border border-border p-3 hover:bg-accent transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{task.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {task.project.name}
                    {task.assignee && ` · ${task.assignee.firstName} ${task.assignee.lastName}`}
                  </p>
                </div>
                <div className="flex items-center gap-3 ml-4">
                  <span className="text-xs text-muted-foreground hidden sm:block">
                    {formatDueDate(task.dueDate)}
                  </span>
                  <StatusBadge status={task.status} />
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
