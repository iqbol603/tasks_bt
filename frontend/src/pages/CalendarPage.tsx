import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/Badge';
import { cn, STATUS_COLORS, STATUS_LABELS } from '@/lib/utils';

type ViewMode = 'month' | 'week' | 'day';

interface CalendarTask {
  id: string;
  title: string;
  status: string;
  dueDate: string;
  project: { name: string; color: string };
  assignee?: { id: string; firstName: string; lastName: string };
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
}

function startOfWeek(d: Date) {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const s = new Date(d);
  s.setDate(d.getDate() + diff);
  s.setHours(0, 0, 0, 0);
  return s;
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function localDateKey(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function CalendarPage() {
  const [cursor, setCursor] = useState(new Date());
  const [view, setView] = useState<ViewMode>('month');

  const rangeFrom =
    view === 'month' ? startOfMonth(cursor) :
    view === 'week' ? startOfWeek(cursor) :
    (() => { const d = new Date(cursor); d.setHours(0, 0, 0, 0); return d; })();

  const rangeTo =
    view === 'month' ? endOfMonth(cursor) :
    view === 'week' ? addDays(startOfWeek(cursor), 6) :
    (() => { const d = new Date(cursor); d.setHours(23, 59, 59, 999); return d; })();

  const { data: tasks = [], isLoading } = useQuery<CalendarTask[]>({
    queryKey: ['calendar', rangeFrom.toISOString(), rangeTo.toISOString()],
    queryFn: () =>
      api.getCalendarTasks(rangeFrom.toISOString(), rangeTo.toISOString()) as Promise<CalendarTask[]>,
  });

  const tasksByDate = tasks.reduce<Record<string, CalendarTask[]>>((acc, t) => {
    const key = localDateKey(t.dueDate);
    (acc[key] ??= []).push(t);
    return acc;
  }, {});

  const workload = tasks.reduce<Record<string, { name: string; count: number }>>((acc, t) => {
    if (!t.assignee) return acc;
    const key = t.assignee.id ?? `${t.assignee.firstName}-${t.assignee.lastName}`;
    const name = `${t.assignee.firstName} ${t.assignee.lastName}`;
    if (!acc[key]) acc[key] = { name, count: 0 };
    acc[key].count++;
    return acc;
  }, {});

  const renderDayView = () => {
    const key = localDateKey(cursor.toISOString());
    const dayTasks = tasksByDate[key] ?? [];
    return (
      <Card>
        <CardContent className="p-4">
          <h3 className="font-medium mb-4">
            {cursor.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
          </h3>
          <div className="space-y-2">
            {dayTasks.map((t) => (
              <Link key={t.id} to={`/tasks/${t.id}`}>
                <div className="flex items-center justify-between rounded-lg border border-border p-3 hover:bg-accent">
                  <div>
                    <p className="font-medium text-sm">{t.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatTime(t.dueDate)} · {t.project.name}
                    </p>
                  </div>
                  <StatusBadge status={t.status} />
                </div>
              </Link>
            ))}
            {dayTasks.length === 0 && (
              <p className="text-sm text-muted-foreground">На этот день задач нет</p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  const navStep = view === 'month' ? 30 : view === 'week' ? 7 : 1;

  const renderMonthGrid = () => {
    const first = startOfMonth(cursor);
    const startDay = first.getDay() === 0 ? 6 : first.getDay() - 1;
    const daysInMonth = endOfMonth(cursor).getDate();
    const cells: (Date | null)[] = [];

    for (let i = 0; i < startDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
    }

    return (
      <div className="grid grid-cols-7 gap-px bg-border rounded-xl overflow-hidden border border-border">
        {WEEKDAYS.map((d) => (
          <div key={d} className="bg-muted p-2 text-center text-xs font-medium text-muted-foreground">
            {d}
          </div>
        ))}
        {cells.map((date, i) => {
          if (!date) return <div key={`e-${i}`} className="bg-background min-h-[100px]" />;
          const key = localDateKey(date.toISOString());
          const dayTasks = tasksByDate[key] ?? [];
          const isToday = key === localDateKey(new Date().toISOString());
          return (
            <div
              key={key}
              className={cn('bg-background min-h-[100px] p-2', isToday && 'ring-2 ring-inset ring-primary')}
            >
              <div className={cn('text-sm font-medium mb-1', isToday && 'text-primary')}>
                {date.getDate()}
              </div>
              <div className="space-y-1">
                {dayTasks.slice(0, 3).map((t) => (
                  <Link
                    key={t.id}
                    to={`/tasks/${t.id}`}
                    className="block truncate rounded px-1 py-0.5 text-xs hover:opacity-80"
                    style={{ backgroundColor: `${t.project.color}22`, color: t.project.color }}
                    title={`${formatTime(t.dueDate)} — ${t.title}`}
                  >
                    {formatTime(t.dueDate)} {t.title}
                  </Link>
                ))}
                {dayTasks.length > 3 && (
                  <span className="text-xs text-muted-foreground">+{dayTasks.length - 3}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderWeekView = () => {
    const start = startOfWeek(cursor);
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

    return (
      <div className="grid gap-4 md:grid-cols-7">
        {days.map((date) => {
          const key = localDateKey(date.toISOString());
          const dayTasks = tasksByDate[key] ?? [];
          return (
            <Card key={key}>
              <CardContent className="p-3">
                <div className="text-sm font-medium mb-2">
                  {date.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric' })}
                </div>
                <div className="space-y-2">
                  {dayTasks.map((t) => (
                    <Link key={t.id} to={`/tasks/${t.id}`} className="block">
                      <div className="rounded-lg border border-border p-2 hover:bg-accent text-xs">
                        <p className="font-medium truncate">{formatTime(t.dueDate)} {t.title}</p>
                        <StatusBadge status={t.status} />
                      </div>
                    </Link>
                  ))}
                  {dayTasks.length === 0 && (
                    <p className="text-xs text-muted-foreground">Нет задач</p>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Календарь</h1>
          <p className="text-muted-foreground capitalize">
            {view === 'day'
              ? cursor.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
              : cursor.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border overflow-hidden">
            {(['month', 'week', 'day'] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  'px-3 py-1.5 text-sm',
                  view === v ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
                )}
              >
                {v === 'month' ? 'Месяц' : v === 'week' ? 'Неделя' : 'День'}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCursor(addDays(cursor, -navStep))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>
            Сегодня
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCursor(addDays(cursor, navStep))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Загрузка...</div>
      ) : view === 'month' ? (
        renderMonthGrid()
      ) : view === 'week' ? (
        renderWeekView()
      ) : (
        renderDayView()
      )}

      <Card>
        <CardContent className="p-4">
          <p className="text-sm font-medium mb-3">Загрузка сотрудников</p>
          <div className="space-y-2">
            {Object.values(workload).map((w) => (
              <div key={w.name} className="flex items-center gap-3">
                <span className="text-sm w-32 truncate">{w.name}</span>
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.min(w.count * 15, 100)}%` }}
                  />
                </div>
                <span className="text-sm text-muted-foreground w-6">{w.count}</span>
              </div>
            ))}
            {Object.keys(workload).length === 0 && (
              <p className="text-sm text-muted-foreground">Нет назначенных задач в периоде</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <p className="text-sm font-medium mb-3">Загрузка по статусам</p>
          <div className="flex flex-wrap gap-3">
            {Object.entries(
              tasks.reduce<Record<string, number>>((acc, t) => {
                acc[t.status] = (acc[t.status] ?? 0) + 1;
                return acc;
              }, {}),
            ).map(([status, count]) => (
              <div key={status} className="flex items-center gap-2 text-sm">
                <span className={cn('rounded-full px-2 py-0.5 text-xs', STATUS_COLORS[status])}>
                  {STATUS_LABELS[status]}
                </span>
                <span className="text-muted-foreground">{count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
