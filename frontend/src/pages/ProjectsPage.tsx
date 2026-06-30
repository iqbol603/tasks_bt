import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Archive, ArchiveRestore, Pencil, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { cn, PROJECT_STATUS_LABELS } from '@/lib/utils';

interface Project {
  id: string;
  name: string;
  description: string | null;
  color: string;
  status: string;
  _count: { tasks: number; members: number };
}

const STATUS_TABS = [
  { value: '', label: 'Активные' },
  { value: 'ACTIVE', label: 'В работе' },
  { value: 'ARCHIVED', label: 'Архив' },
  { value: 'TEMPLATE', label: 'Шаблоны' },
];

const PROJECT_STATUSES = ['ACTIVE', 'ARCHIVED', 'TEMPLATE'];

const emptyForm = {
  name: '',
  description: '',
  color: '#3B82F6',
  status: 'ACTIVE',
};

export function ProjectsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [statusFilter, setStatusFilter] = useState('');

  const canManage = ['ADMIN', 'MANAGER', 'DIRECTOR'].includes(user?.role ?? '');

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ['projects', statusFilter],
    queryFn: () => api.getProjects(statusFilter || undefined) as Promise<Project[]>,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['projects'] });
  };

  const createMutation = useMutation({
    mutationFn: () => api.createProject({ name: form.name, description: form.description, color: form.color }),
    onSuccess: () => {
      invalidate();
      setShowForm(false);
      setForm(emptyForm);
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      api.updateProject(editing!.id, {
        name: form.name,
        description: form.description || undefined,
        color: form.color,
        status: form.status,
      }),
    onSuccess: () => {
      invalidate();
      setEditing(null);
      setForm(emptyForm);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => api.archiveProject(id),
    onSuccess: invalidate,
  });

  const unarchiveMutation = useMutation({
    mutationFn: (id: string) => api.unarchiveProject(id),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteProject(id),
    onSuccess: invalidate,
  });

  const openEdit = (project: Project) => {
    setEditing(project);
    setShowForm(false);
    setForm({
      name: project.name,
      description: project.description ?? '',
      color: project.color,
      status: project.status,
    });
  };

  const filtered = statusFilter
    ? projects
    : projects.filter((p) => p.status === 'ACTIVE' || p.status === 'TEMPLATE');

  const handleDelete = (project: Project) => {
    if (!window.confirm(`Удалить проект «${project.name}»? Все задачи проекта будут удалены.`)) return;
    deleteMutation.mutate(project.id);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Проекты</h1>
          <p className="text-muted-foreground">Управление проектами и командами</p>
        </div>
        {canManage && (
          <Button onClick={() => { setShowForm(!showForm); setEditing(null); setForm(emptyForm); }}>
            <Plus className="h-4 w-4" />
            Новый проект
          </Button>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm border border-border',
              statusFilter === tab.value ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {(showForm || editing) && canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{editing ? 'Редактировать проект' : 'Новый проект'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input placeholder="Название проекта *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input placeholder="Описание" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <div className="flex items-center gap-3 flex-wrap">
              <label className="text-sm">Цвет:</label>
              <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-10 w-14 cursor-pointer rounded border border-input" />
              {editing && (
                <>
                  <label className="text-sm ml-2">Статус:</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
                  >
                    {PROJECT_STATUSES.map((s) => (
                      <option key={s} value={s}>{PROJECT_STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => (editing ? updateMutation.mutate() : createMutation.mutate())}
                disabled={!form.name || createMutation.isPending || updateMutation.isPending}
              >
                {editing ? 'Сохранить' : 'Создать'}
              </Button>
              <Button variant="outline" onClick={() => { setShowForm(false); setEditing(null); }}>
                Отмена
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="text-muted-foreground">Загрузка...</div>
      ) : filtered.length === 0 ? (
        <div className="text-muted-foreground text-center py-12">
          {statusFilter === 'ARCHIVED' ? 'Архивных проектов нет' : 'Проектов не найдено'}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((project) => (
            <Card key={project.id} className={cn('hover:shadow-md transition-shadow', project.status === 'ARCHIVED' && 'opacity-80')}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-4 w-4 rounded-full shrink-0" style={{ backgroundColor: project.color }} />
                    <CardTitle className="text-base truncate">{project.name}</CardTitle>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" title="Редактировать" onClick={() => openEdit(project)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {project.status === 'ACTIVE' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="В архив"
                          onClick={() => archiveMutation.mutate(project.id)}
                          disabled={archiveMutation.isPending}
                        >
                          <Archive className="h-4 w-4" />
                        </Button>
                      )}
                      {project.status === 'ARCHIVED' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Восстановить из архива"
                          onClick={() => unarchiveMutation.mutate(project.id)}
                          disabled={unarchiveMutation.isPending}
                        >
                          <ArchiveRestore className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Удалить"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(project)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {PROJECT_STATUS_LABELS[project.status] ?? project.status}
                </span>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                  {project.description || 'Без описания'}
                </p>
                <div className="flex gap-4 text-sm text-muted-foreground">
                  <span>{project._count.tasks} задач</span>
                  <span>{project._count.members} участников</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
