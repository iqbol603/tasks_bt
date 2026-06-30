import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Play, Square, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { formatDateTime } from '@/lib/utils';

interface TimeEntry {
  id: string;
  startedAt: string;
  endedAt: string | null;
  duration: number | null;
  description: string | null;
  user: { firstName: string; lastName: string };
}

function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}ч ${m}м` : `${m}м`;
}

function useElapsed(startedAt: string | null, running: boolean) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!running || !startedAt) return;
    const tick = () => setElapsed(Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [running, startedAt]);

  return elapsed;
}

export function TimeTracker({ taskId }: { taskId: string }) {
  const queryClient = useQueryClient();

  const { data } = useQuery<{ entries: TimeEntry[]; totalMinutes: number }>({
    queryKey: ['time', taskId],
    queryFn: () => api.getTaskTime(taskId) as Promise<{ entries: TimeEntry[]; totalMinutes: number }>,
  });

  const { data: active } = useQuery<{ id: string; taskId: string; startedAt: string } | null>({
    queryKey: ['time-active'],
    queryFn: () => api.getActiveTimer() as Promise<{ id: string; taskId: string; startedAt: string } | null>,
    refetchInterval: 5000,
  });

  const isRunningHere = active?.taskId === taskId;
  const elapsed = useElapsed(active?.startedAt ?? null, isRunningHere);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['time', taskId] });
    queryClient.invalidateQueries({ queryKey: ['time-active'] });
  };

  const startMutation = useMutation({
    mutationFn: () => api.startTimer(taskId),
    onSuccess: invalidate,
  });

  const stopMutation = useMutation({
    mutationFn: () => api.stopTimer(taskId),
    onSuccess: invalidate,
  });

  const formatElapsed = (sec: number) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Учёт времени
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-2xl font-mono font-bold">
            {isRunningHere ? formatElapsed(elapsed) : formatDuration(data?.totalMinutes ?? 0)}
          </span>
          {isRunningHere ? (
            <Button size="sm" variant="destructive" onClick={() => stopMutation.mutate()}>
              <Square className="h-4 w-4" />
              Стоп
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => startMutation.mutate()}
              disabled={!!active && !isRunningHere}
              title={active && !isRunningHere ? 'Остановите другой таймер' : undefined}
            >
              <Play className="h-4 w-4" />
              Старт
            </Button>
          )}
        </div>

        {active && !isRunningHere && (
          <p className="text-xs text-amber-600">Таймер запущен на другой задаче</p>
        )}

        <div className="space-y-1 max-h-32 overflow-y-auto">
          {data?.entries.slice(0, 5).map((e) => (
            <div key={e.id} className="flex justify-between text-xs text-muted-foreground">
              <span>{e.user.firstName} {e.user.lastName}</span>
              <span>
                {e.duration != null ? formatDuration(e.duration) : '...'}
                {' · '}{formatDateTime(e.startedAt)}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
