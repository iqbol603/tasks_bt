import { useQuery } from '@tanstack/react-query';
import { Download, BarChart3, AlertTriangle, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { STATUS_LABELS, PRIORITY_LABELS } from '@/lib/utils';

interface ReportSummary {
  byStatus: { status: string; count: number }[];
  byPriority: { priority: string; count: number }[];
  byAssignee: { name: string; department: string | null; count: number }[];
  overdue: number;
  totalTimeMinutes: number;
}

function downloadReport(format: 'csv' | 'xlsx' | 'pdf') {
  const token = api.getAccessToken();
  const url = `/api/reports/tasks?format=${format}`;
  const a = document.createElement('a');
  fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    .then((res) => res.blob())
    .then((blob) => {
      const ext = format === 'xlsx' ? 'xlsx' : format === 'pdf' ? 'pdf' : 'csv';
      a.href = URL.createObjectURL(blob);
      a.download = `tasks-report.${ext}`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
}

function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} ч ${m} мин` : `${m} мин`;
}

export function ReportsPage() {
  const { data, isLoading } = useQuery<ReportSummary>({
    queryKey: ['reports-summary'],
    queryFn: () => api.getReportSummary() as Promise<ReportSummary>,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Отчёты</h1>
          <p className="text-muted-foreground">Аналитика и экспорт данных</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => downloadReport('csv')}>
            <Download className="h-4 w-4" />
            CSV
          </Button>
          <Button variant="outline" onClick={() => downloadReport('xlsx')}>
            <Download className="h-4 w-4" />
            Excel
          </Button>
          <Button variant="outline" onClick={() => downloadReport('pdf')}>
            <Download className="h-4 w-4" />
            PDF
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Загрузка...</div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="flex items-center gap-4 p-6">
                <BarChart3 className="h-8 w-8 text-blue-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Всего задач</p>
                  <p className="text-2xl font-bold">
                    {data?.byStatus.reduce((s, i) => s + i.count, 0) ?? 0}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-4 p-6">
                <AlertTriangle className="h-8 w-8 text-red-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Просрочено</p>
                  <p className="text-2xl font-bold">{data?.overdue ?? 0}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-4 p-6">
                <Clock className="h-8 w-8 text-green-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Затрачено времени</p>
                  <p className="text-2xl font-bold">{formatDuration(data?.totalTimeMinutes ?? 0)}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>По статусам</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {data?.byStatus.map((item) => (
                  <div key={item.status} className="flex justify-between text-sm">
                    <span>{STATUS_LABELS[item.status] ?? item.status}</span>
                    <span className="font-medium">{item.count}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>По приоритетам</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {data?.byPriority.map((item) => (
                  <div key={item.priority} className="flex justify-between text-sm">
                    <span>{PRIORITY_LABELS[item.priority] ?? item.priority}</span>
                    <span className="font-medium">{item.count}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader><CardTitle>Загрузка сотрудников</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data?.byAssignee.map((item) => (
                    <div key={item.name} className="flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{item.name}</p>
                        {item.department && (
                          <p className="text-xs text-muted-foreground">{item.department}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(item.count * 20, 200)}px` }} />
                        <span className="text-sm font-medium w-8 text-right">{item.count}</span>
                      </div>
                    </div>
                  ))}
                  {data?.byAssignee.length === 0 && (
                    <p className="text-sm text-muted-foreground">Нет назначенных задач</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
