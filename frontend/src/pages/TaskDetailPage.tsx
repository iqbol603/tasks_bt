import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Pencil, Upload, Trash2, Play, Send, CheckCircle, RotateCcw, ShieldCheck } from 'lucide-react';
import { api, type User } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { StatusBadge, PriorityBadge } from '@/components/ui/Badge';
import { TaskFormDialog, type TaskFormData } from '@/components/tasks/TaskFormDialog';
import { TimeTracker } from '@/components/tasks/TimeTracker';
import { CommentInput, renderCommentContent } from '@/components/tasks/CommentInput';
import { AuthenticatedImage, downloadAuthenticatedFile, openAuthenticatedPreview } from '@/components/tasks/FilePreview';
import { formatDueDate, combineDateTime, splitDateTime, formatDateTime, STATUS_LABELS } from '@/lib/utils';

export function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [subtaskTitle, setSubtaskTitle] = useState('');
  const [subtaskAssigneeId, setSubtaskAssigneeId] = useState('');
  const [subtaskDueDate, setSubtaskDueDate] = useState('');
  const [subtaskDueTime, setSubtaskDueTime] = useState('18:00');
  const [checklistTitle, setChecklistTitle] = useState('');
  const [showEdit, setShowEdit] = useState(false);
  const [newTagName, setNewTagName] = useState('');

  const { data: task, isLoading } = useQuery({
    queryKey: ['task', id],
    queryFn: () => api.getTask(id!),
    enabled: !!id,
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => api.getUsers(),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['task', id] });

  const commentMutation = useMutation({
    mutationFn: ({ content, mentionIds }: { content: string; mentionIds: string[] }) =>
      api.postComment(id!, content, mentionIds),
    onSuccess: () => invalidate(),
  });

  const updateMutation = useMutation({
    mutationFn: (form: TaskFormData) =>
      api.updateTask(id!, {
        title: form.title,
        description: form.description || undefined,
        assigneeId: form.assigneeId || null,
        status: form.status,
        priority: form.priority,
        dueDate: combineDateTime(form.dueDate, form.dueTime),
      }),
    onSuccess: () => { invalidate(); setShowEdit(false); },
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) => api.updateTask(id!, { status }),
    onSuccess: (_data, status) => {
      queryClient.invalidateQueries({ queryKey: ['review-queue'] });
      queryClient.invalidateQueries({ queryKey: ['employee-analytics'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
      if (status === 'DONE') {
        navigate('/tasks');
        return;
      }
      invalidate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (taskId: string) => api.deleteTask(taskId),
    onSuccess: () => {
      // если удалили подзадачу из списка — остаёмся на странице родителя
      queryClient.invalidateQueries({ queryKey: ['task', id] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
    },
  });

  const approveAssignmentMutation = useMutation({
    mutationFn: (approve: boolean) => api.approveSubtaskAssignment(id!, approve),
    onSuccess: () => invalidate(),
  });

  const subtaskMutation = useMutation({
    mutationFn: () =>
      api.createTask({
        title: subtaskTitle,
        projectId: (task as { projectId: string }).projectId,
        parentId: id,
        assigneeId: subtaskAssigneeId || null,
        status: 'TODO',
        priority: 'MEDIUM',
        dueDate: combineDateTime(subtaskDueDate, subtaskDueTime),
      }),
    onSuccess: () => {
      invalidate();
      setSubtaskTitle('');
      setSubtaskAssigneeId('');
      setSubtaskDueDate('');
      setSubtaskDueTime('18:00');
    },
  });

  const checklistMutation = useMutation({
    mutationFn: () => api.addChecklistItem(id!, checklistTitle),
    onSuccess: () => { invalidate(); setChecklistTitle(''); },
  });

  const toggleChecklist = useMutation({
    mutationFn: ({ cid, isDone }: { cid: string; isDone: boolean }) =>
      api.toggleChecklist(id!, cid, isDone),
    onSuccess: invalidate,
  });

  const addWatcher = useMutation({
    mutationFn: (userId: string) => api.addWatcher(id!, userId),
    onSuccess: invalidate,
  });

  const removeWatcher = useMutation({
    mutationFn: (userId: string) => api.removeWatcher(id!, userId),
    onSuccess: invalidate,
  });

  const createAndAddTag = useMutation({
    mutationFn: async () => {
      const t = task as { projectId: string };
      const tag = await api.createTag(t.projectId, newTagName) as { id: string };
      await api.addTaskTag(id!, tag.id);
    },
    onSuccess: () => { invalidate(); setNewTagName(''); },
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => api.uploadFile(id!, file),
    onSuccess: invalidate,
  });

  if (isLoading) return <div className="text-muted-foreground">Загрузка...</div>;
  if (!task) return <div>Задача не найдена</div>;

  const t = task as {
    id: string;
    projectId: string;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    dueDate: string | null;
    assigneeId: string | null;
    parentId?: string | null;
    requestedAssigneeId?: string | null;
    isAssignmentApproved?: boolean;
    project: { name: string; color: string };
    assignee?: { id: string; firstName: string; lastName: string };
    creator: { id: string; firstName: string; lastName: string; role?: string };
    checklists: { id: string; title: string; isDone: boolean }[];
    subtasks: Array<{
      id: string;
      title: string;
      status: string;
      dueDate: string | null;
      assignee?: { id: string; firstName: string; lastName: string } | null;
      creator?: { id: string; role?: string };
      requestedAssigneeId?: string | null;
      isAssignmentApproved?: boolean;
    }>;
    tags: Array<{ tag: { id: string; name: string; color: string } }>;
    watchers: Array<{ user: { id: string; firstName: string; lastName: string } }>;
    files: Array<{ id: string; originalName: string; size: number; version: number; mimeType: string }>;
    comments: Array<{
      id: string;
      content: string;
      createdAt: string;
      author: { firstName: string; lastName: string };
    }>;
    history: Array<{
      id: string;
      action: string;
      field: string | null;
      createdAt: string;
      user: { firstName: string; lastName: string };
    }>;
  };

  const watcherIds = new Set(t.watchers.map((w) => w.user.id));

  const isManager = ['ADMIN', 'MANAGER', 'DIRECTOR'].includes(user?.role ?? '');
  const isAssignee = t.assigneeId === user?.id;
  const canDeleteThisTask = isManager || t.creator?.id === user?.id;
  const wantsOtherAssigneeApproval =
    !isManager &&
    !!subtaskAssigneeId &&
    subtaskAssigneeId !== user?.id;

  const usersById = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <Link to="/tasks" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Назад к задачам
        </Link>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowEdit(true)}>
            <Pencil className="h-4 w-4" />
            Редактировать
          </Button>
          {canDeleteThisTask && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                if (window.confirm('Удалить задачу?')) deleteMutation.mutate(t.id);
              }}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="h-4 w-4" />
              Удалить
            </Button>
          )}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: t.project.color }} />
          <span className="text-sm text-muted-foreground">{t.project.name}</span>
          {t.tags.map(({ tag }) => (
            <span
              key={tag.id}
              className="rounded-full px-2 py-0.5 text-xs font-medium"
              style={{ backgroundColor: `${tag.color}22`, color: tag.color }}
            >
              {tag.name}
            </span>
          ))}
        </div>
        <h1 className="text-2xl font-bold">{t.title}</h1>
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <StatusBadge status={t.status} />
          <PriorityBadge priority={t.priority} />
          <span className="text-sm text-muted-foreground">Срок: {formatDueDate(t.dueDate)}</span>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          {isAssignee && t.status === 'TODO' && (
            <Button size="sm" onClick={() => statusMutation.mutate('IN_PROGRESS')} disabled={statusMutation.isPending}>
              <Play className="h-4 w-4" />
              Принять в работу
            </Button>
          )}
          {isAssignee && t.status === 'IN_PROGRESS' && (
            <Button size="sm" onClick={() => statusMutation.mutate('REVIEW')} disabled={statusMutation.isPending}>
              <Send className="h-4 w-4" />
              Отправить на проверку
            </Button>
          )}
          {isManager && t.status === 'REVIEW' && (
            <>
              <Button size="sm" onClick={() => statusMutation.mutate('DONE')} disabled={statusMutation.isPending}>
                <CheckCircle className="h-4 w-4" />
                Принять и закрыть
              </Button>
              <Button variant="outline" size="sm" onClick={() => statusMutation.mutate('IN_PROGRESS')} disabled={statusMutation.isPending}>
                <RotateCcw className="h-4 w-4" />
                Вернуть на доработку
              </Button>
            </>
          )}
        </div>

        {isManager && t.isAssignmentApproved === false && t.requestedAssigneeId && (
          <div className="mt-4 rounded-lg border border-border bg-accent p-3 text-sm">
            <div className="flex items-center gap-2 font-medium">
              <ShieldCheck className="h-4 w-4" />
              Запрос назначения исполнителя
            </div>
            <div className="text-muted-foreground text-xs mt-1">
              Запрошено назначить: <span className="font-medium text-foreground">{usersById.get(t.requestedAssigneeId) ?? t.requestedAssigneeId}</span>
            </div>
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                onClick={() => approveAssignmentMutation.mutate(true)}
                disabled={approveAssignmentMutation.isPending}
              >
                Одобрить
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => approveAssignmentMutation.mutate(false)}
                disabled={approveAssignmentMutation.isPending}
              >
                Отклонить
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Описание</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">{t.description || 'Без описания'}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Подзадачи ({t.subtasks.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {t.subtasks.map((s) => (
                <Link
                  key={s.id}
                  to={`/tasks/${s.id}`}
                  className="flex items-center justify-between rounded-lg border border-border p-2 hover:bg-accent text-sm gap-3"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{s.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      {s.isAssignmentApproved === false && s.requestedAssigneeId
                        ? `Ожидает одобрения: ${usersById.get(s.requestedAssigneeId) ?? s.requestedAssigneeId}`
                        : (s.assignee ? `${s.assignee.firstName} ${s.assignee.lastName}` : 'Без исполнителя')}
                      {' · '}
                      {s.dueDate ? formatDueDate(s.dueDate) : 'Без срока'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={s.status} />
                    {(isManager || s.creator?.id === user?.id) && (
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-destructive"
                        title="Удалить подзадачу"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (window.confirm('Удалить подзадачу?')) deleteMutation.mutate(s.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </Link>
              ))}
              <div className="grid gap-2 mt-2">
                <div className="flex gap-2">
                <input
                  value={subtaskTitle}
                  onChange={(e) => setSubtaskTitle(e.target.value)}
                  placeholder="Новая подзадача..."
                  className="flex-1 h-9 rounded-lg border border-input bg-background px-3 text-sm"
                />
                <Button
                  size="sm"
                  onClick={() => subtaskMutation.mutate()}
                  disabled={!subtaskTitle || !subtaskAssigneeId || subtaskMutation.isPending}
                >
                  <Plus className="h-4 w-4" />
                </Button>
                </div>

                {!subtaskAssigneeId && subtaskTitle && (
                  <div className="text-xs text-destructive">
                    Выберите исполнителя — подзадача без исполнителя запрещена.
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <select
                    value={subtaskAssigneeId}
                    onChange={(e) => setSubtaskAssigneeId(e.target.value)}
                    className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
                  >
                    <option value="">Без исполнителя</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.firstName} {u.lastName}
                      </option>
                    ))}
                  </select>

                  <input
                    type="date"
                    value={subtaskDueDate}
                    onChange={(e) => setSubtaskDueDate(e.target.value)}
                    className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
                  />

                  <input
                    type="time"
                    value={subtaskDueTime}
                    onChange={(e) => setSubtaskDueTime(e.target.value)}
                    className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
                    disabled={!subtaskDueDate}
                  />
                </div>

                {wantsOtherAssigneeApproval && (
                  <div className="text-xs text-muted-foreground">
                    Назначение другого сотрудника потребует одобрения руководителя/админа. Подзадача будет создана как “ожидает одобрения”.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Чек-лист</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {t.checklists.map((item) => (
                <label key={item.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={item.isDone}
                    onChange={(e) => toggleChecklist.mutate({ cid: item.id, isDone: e.target.checked })}
                    className="rounded"
                  />
                  <span className={item.isDone ? 'line-through text-muted-foreground' : ''}>{item.title}</span>
                </label>
              ))}
              <div className="flex gap-2 mt-2">
                <input
                  value={checklistTitle}
                  onChange={(e) => setChecklistTitle(e.target.value)}
                  placeholder="Пункт чек-листа..."
                  className="flex-1 h-9 rounded-lg border border-input bg-background px-3 text-sm"
                />
                <Button size="sm" onClick={() => checklistMutation.mutate()} disabled={!checklistTitle}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Файлы</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {t.files.map((f) => {
                const previewable = f.mimeType?.startsWith('image/') || f.mimeType === 'application/pdf';
                return (
                  <div key={f.id} className="border border-border rounded-lg p-2 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>{f.originalName}</span>
                      <span className="text-muted-foreground text-xs">v{f.version} · {(f.size / 1024).toFixed(1)} KB</span>
                    </div>
                    <div className="flex gap-3 text-xs">
                      <button
                        type="button"
                        onClick={() => downloadAuthenticatedFile(f.id)}
                        className="text-primary hover:underline"
                      >
                        Скачать
                      </button>
                      {previewable && f.mimeType === 'application/pdf' && (
                        <button
                          type="button"
                          onClick={() => openAuthenticatedPreview(f.id)}
                          className="text-primary hover:underline"
                        >
                          Открыть PDF
                        </button>
                      )}
                    </div>
                    {previewable && f.mimeType.startsWith('image/') && (
                      <AuthenticatedImage
                        fileId={f.id}
                        alt={f.originalName}
                        className="max-h-48 rounded-lg object-contain"
                      />
                    )}
                  </div>
                );
              })}
              <label className="flex items-center gap-2 cursor-pointer text-sm text-primary hover:underline">
                <Upload className="h-4 w-4" />
                Загрузить файл
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && uploadMutation.mutate(e.target.files[0])}
                />
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Комментарии</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {t.comments.map((c) => (
                <div key={c.id} className="rounded-lg bg-accent p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{c.author.firstName} {c.author.lastName}</span>
                    <span className="text-xs text-muted-foreground">{formatDateTime(c.createdAt)}</span>
                  </div>
                  <p className="text-sm">{renderCommentContent(c.content)}</p>
                </div>
              ))}
              <CommentInput
                onSubmit={(content, mentionIds) => commentMutation.mutate({ content, mentionIds })}
                disabled={commentMutation.isPending}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Детали</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground">Статус</p>
                <p>{STATUS_LABELS[t.status]}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Исполнитель</p>
                <p>{t.assignee ? `${t.assignee.firstName} ${t.assignee.lastName}` : 'Не назначен'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Постановщик</p>
                <p>{t.creator.firstName} {t.creator.lastName}</p>
              </div>
            </CardContent>
          </Card>

          <TimeTracker taskId={t.id} />

          <Card>
            <CardHeader><CardTitle className="text-base">Наблюдатели</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {t.watchers.map(({ user }) => (
                <div key={user.id} className="flex items-center justify-between text-sm">
                  <span>{user.firstName} {user.lastName}</span>
                  <button onClick={() => removeWatcher.mutate(user.id)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <select
                className="w-full h-9 rounded-lg border border-input bg-background px-2 text-sm"
                defaultValue=""
                onChange={(e) => { if (e.target.value) addWatcher.mutate(e.target.value); e.target.value = ''; }}
              >
                <option value="">Добавить наблюдателя</option>
                {users.filter((u) => !watcherIds.has(u.id)).map((u) => (
                  <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                ))}
              </select>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Теги</CardTitle></CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <input
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder="Новый тег"
                  className="flex-1 h-9 rounded-lg border border-input bg-background px-3 text-sm"
                />
                <Button size="sm" onClick={() => createAndAddTag.mutate()} disabled={!newTagName}>+</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">История</CardTitle></CardHeader>
            <CardContent className="space-y-2 max-h-64 overflow-y-auto">
              {t.history.map((h) => (
                <div key={h.id} className="text-xs border-l-2 border-border pl-3 py-1">
                  <p>
                    <span className="font-medium">{h.user.firstName} {h.user.lastName}</span>
                    {' '}— {h.action}{h.field && ` (${h.field})`}
                  </p>
                  <p className="text-muted-foreground">{formatDateTime(h.createdAt)}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <TaskFormDialog
        open={showEdit}
        onClose={() => setShowEdit(false)}
        title="Редактировать задачу"
        initial={(() => {
          const due = splitDateTime(t.dueDate);
          return {
            title: t.title,
            description: t.description ?? '',
            projectId: t.projectId,
            assigneeId: t.assigneeId ?? '',
            status: t.status,
            priority: t.priority,
            dueDate: due.date,
            dueTime: due.time,
          };
        })()}
        onSubmit={(data) => updateMutation.mutate(data)}
        loading={updateMutation.isPending}
      />
    </div>
  );
}
