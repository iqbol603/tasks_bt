import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Save } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { formatDate } from '@/lib/utils';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function DailyReportPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(todayStr());
  const [content, setContent] = useState('');

  const isManager = ['ADMIN', 'MANAGER', 'DIRECTOR'].includes(user?.role ?? '');

  const { data: myReport, isLoading } = useQuery({
    queryKey: ['daily-report', date],
    queryFn: () => api.getMyDailyReport(date) as Promise<{ content?: string }>,
  });

  useEffect(() => {
    setContent(myReport?.content ?? '');
  }, [myReport, date]);

  const { data: teamReports = [] } = useQuery({
    queryKey: ['daily-reports-team', date],
    queryFn: () => api.getDailyReports(date) as Promise<Array<{
      id: string;
      content: string;
      reportDate: string;
      user: { firstName: string; lastName: string; department: string | null };
    }>>,
    enabled: isManager,
  });

  const { data: history = [] } = useQuery({
    queryKey: ['daily-report-history'],
    queryFn: () => api.getDailyReportHistory() as Promise<Array<{ id: string; reportDate: string; content: string }>>,
  });

  const saveMutation = useMutation({
    mutationFn: () => api.saveDailyReport(content, date),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daily-report'] });
      queryClient.invalidateQueries({ queryKey: ['daily-reports-team'] });
      queryClient.invalidateQueries({ queryKey: ['daily-report-history'] });
    },
  });

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardList className="h-6 w-6" />
          Ежедневный отчёт
        </h1>
        <p className="text-muted-foreground">Опишите, что вы сделали на работе сегодня</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Мой отчёт за день</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
          />
          {isLoading ? (
            <p className="text-muted-foreground text-sm">Загрузка...</p>
          ) : (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={'Например:\n• Завершил задачу по отчёту\n• Провёл встречу с клиентом\n• Подготовил презентацию'}
              rows={8}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-y"
            />
          )}
          <Button onClick={() => saveMutation.mutate()} disabled={!content.trim() || saveMutation.isPending}>
            <Save className="h-4 w-4" />
            Сохранить отчёт
          </Button>
        </CardContent>
      </Card>

      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Мои прошлые отчёты</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {history.map((r) => (
              <div key={r.id} className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground mb-1">{formatDate(r.reportDate)}</p>
                <p className="text-sm whitespace-pre-wrap">{r.content}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {isManager && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Отчёты команды за {formatDate(date)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {teamReports.length === 0 ? (
              <p className="text-sm text-muted-foreground">Нет отчётов за этот день</p>
            ) : (
              teamReports.map((r) => (
                <div key={r.id} className="rounded-lg border border-border p-3">
                  <p className="font-medium text-sm">
                    {r.user.firstName} {r.user.lastName}
                    {r.user.department && (
                      <span className="text-muted-foreground font-normal"> · {r.user.department}</span>
                    )}
                  </p>
                  <p className="text-sm whitespace-pre-wrap mt-2">{r.content}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
