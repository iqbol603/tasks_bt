import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Users, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/Badge';
import { formatDateTime, ROLE_LABELS } from '@/lib/utils';

interface EmployeeStat {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  department: string | null;
  loginCount7d: number;
  loginCount30d: number;
  taskViews7d: number;
  taskUpdates7d: number;
  comments7d: number;
  activeTasks: number;
  completedTasks: number;
  overdueTasks: number;
  inReviewTasks: number;
  dailyReports7d: number;
  avgAcceptHours: number | null;
  lastLoginAt: string | null;
  lastActivityAt: string | null;
}

export function EmployeeAnalyticsPage() {
  const { user } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const canView = ['ADMIN', 'MANAGER', 'DIRECTOR'].includes(user?.role ?? '');

  const { data: employees = [], isLoading } = useQuery<EmployeeStat[]>({
    queryKey: ['employee-analytics'],
    queryFn: () => api.getEmployeeAnalytics() as Promise<EmployeeStat[]>,
    enabled: canView,
  });

  const { data: reviewQueue = [] } = useQuery({
    queryKey: ['review-queue'],
    queryFn: () => api.getReviewQueue() as Promise<Array<{
      id: string;
      title: string;
      assignee?: { firstName: string; lastName: string };
      project: { name: string; color: string };
    }>>,
    enabled: canView,
  });

  const { data: detail } = useQuery({
    queryKey: ['employee-detail', selectedId],
    queryFn: () => api.getEmployeeDetail(selectedId!) as Promise<{
      user: { firstName: string; lastName: string };
      activity: Array<{ id: string; action: string; createdAt: string; entityType: string | null }>;
      tasks: Array<{ id: string; title: string; status: string; assignedAt: string | null; acceptedAt: string | null }>;
      reports: Array<{ reportDate: string; content: string }>;
    }>,
    enabled: !!selectedId,
  });

  if (!canView) {
    return <div className="text-muted-foreground">Раздел доступен только руководителям и администраторам</div>;
  }

  const ACTION_LABELS: Record<string, string> = {
    login: 'Вход в систему',
    task_view: 'Просмотр задачи',
    task_update: 'Изменение задачи',
    comment: 'Комментарий',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="h-6 w-6" />
          Аналитика сотрудников
        </h1>
        <p className="text-muted-foreground">Активность, задачи и ежедневные отчёты</p>
      </div>

      {reviewQueue.length > 0 && (
        <Card className="border-purple-200 dark:border-purple-900">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-purple-600" />
              На проверке ({reviewQueue.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {reviewQueue.map((t) => (
              <Link
                key={t.id}
                to={`/tasks/${t.id}`}
                className="flex items-center justify-between rounded-lg border border-border p-3 hover:bg-accent text-sm"
              >
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: t.project.color }} />
                  <span className="font-medium">{t.title}</span>
                </div>
                <span className="text-muted-foreground">
                  {t.assignee ? `${t.assignee.firstName} ${t.assignee.lastName}` : '—'} · {t.project.name}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="text-muted-foreground">Загрузка...</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">Сотрудник</th>
                <th className="text-left p-3 font-medium">Входы 7д</th>
                <th className="text-left p-3 font-medium">Работа с задачами</th>
                <th className="text-left p-3 font-medium">Задачи</th>
                <th className="text-left p-3 font-medium">Принятие</th>
                <th className="text-left p-3 font-medium">Отчёты 7д</th>
                <th className="text-left p-3 font-medium">Последняя активность</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr
                  key={emp.id}
                  className="border-t border-border hover:bg-accent/50 cursor-pointer"
                  onClick={() => setSelectedId(emp.id === selectedId ? null : emp.id)}
                >
                  <td className="p-3">
                    <p className="font-medium">{emp.firstName} {emp.lastName}</p>
                    <p className="text-xs text-muted-foreground">{ROLE_LABELS[emp.role]}{emp.department ? ` · ${emp.department}` : ''}</p>
                  </td>
                  <td className="p-3">
                    <span className="font-medium">{emp.loginCount7d}</span>
                    <span className="text-muted-foreground text-xs"> / {emp.loginCount30d} за 30д</span>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">
                    👁 {emp.taskViews7d} · ✏ {emp.taskUpdates7d} · 💬 {emp.comments7d}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1 text-xs">
                      <span>{emp.activeTasks} акт.</span>
                      <span className="text-green-600">{emp.completedTasks} гот.</span>
                      {emp.overdueTasks > 0 && (
                        <span className="text-destructive flex items-center gap-0.5">
                          <AlertTriangle className="h-3 w-3" />{emp.overdueTasks}
                        </span>
                      )}
                      {emp.inReviewTasks > 0 && (
                        <span className="text-purple-600">{emp.inReviewTasks} проверка</span>
                      )}
                    </div>
                  </td>
                  <td className="p-3 text-xs">
                    {emp.avgAcceptHours != null ? (
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{emp.avgAcceptHours} ч</span>
                    ) : '—'}
                  </td>
                  <td className="p-3">{emp.dailyReports7d}</td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {emp.lastActivityAt ? formatDateTime(emp.lastActivityAt) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedId && detail && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              {detail.user.firstName} {detail.user.lastName} — детали
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="font-medium text-sm mb-2">Последняя активность</h3>
              <div className="space-y-1 max-h-48 overflow-y-auto text-xs">
                {detail.activity.map((a) => (
                  <div key={a.id} className="flex justify-between border-b border-border py-1">
                    <span>{ACTION_LABELS[a.action] ?? a.action}</span>
                    <span className="text-muted-foreground">{formatDateTime(a.createdAt)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="font-medium text-sm mb-2">Задачи</h3>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {detail.tasks.map((t) => (
                  <Link key={t.id} to={`/tasks/${t.id}`} className="flex items-center justify-between text-sm hover:underline py-1">
                    <span className="truncate">{t.title}</span>
                    <StatusBadge status={t.status} />
                  </Link>
                ))}
              </div>
            </div>
            <div className="lg:col-span-2">
              <h3 className="font-medium text-sm mb-2">Ежедневные отчёты</h3>
              <div className="space-y-2">
                {detail.reports.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Нет отчётов</p>
                ) : (
                  detail.reports.map((r, i) => (
                    <div key={i} className="rounded-lg border border-border p-2 text-sm">
                      <p className="text-xs text-muted-foreground mb-1">{new Date(r.reportDate).toLocaleDateString('ru-RU')}</p>
                      <p className="whitespace-pre-wrap">{r.content}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
