import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { api, type Department } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { isDirectorRole } from '@/lib/utils';

export function DepartmentsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [name, setName] = useState('');

  const canManage =
    user?.role === 'ADMIN' ||
    user?.role === 'HR' ||
    isDirectorRole(user?.role) ||
    user?.role === 'MANAGER';

  const { data: departments = [], isLoading } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: () => api.getDepartments(),
    enabled: canManage,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['departments'] });
    queryClient.invalidateQueries({ queryKey: ['team'] });
    queryClient.invalidateQueries({ queryKey: ['users'] });
  };

  const createMutation = useMutation({
    mutationFn: () => api.createDepartment(name.trim()),
    onSuccess: () => {
      invalidate();
      setShowForm(false);
      setName('');
      showToast({ title: 'Отдел создан', message: '' });
    },
    onError: (err: Error) => showToast({ title: 'Ошибка', message: err.message }),
  });

  const updateMutation = useMutation({
    mutationFn: () => api.updateDepartment(editing!.id, name.trim()),
    onSuccess: () => {
      invalidate();
      setEditing(null);
      setName('');
      showToast({ title: 'Отдел обновлён', message: '' });
    },
    onError: (err: Error) => showToast({ title: 'Ошибка', message: err.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteDepartment(id),
    onSuccess: () => {
      invalidate();
      showToast({ title: 'Отдел удалён', message: '' });
    },
    onError: (err: Error) => showToast({ title: 'Ошибка', message: err.message }),
  });

  if (!canManage) {
    return <div className="text-muted-foreground">Раздел доступен руководителям и HR</div>;
  }

  const isBusy = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Отделы</h1>
          <p className="text-muted-foreground">Справочник отделов для привязки сотрудников</p>
        </div>
        <Button
          onClick={() => {
            setShowForm(!showForm);
            setEditing(null);
            setName('');
          }}
        >
          <Plus className="h-4 w-4" />
          Добавить
        </Button>
      </div>

      {(showForm || editing) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{editing ? 'Редактировать отдел' : 'Новый отдел'}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs text-muted-foreground mb-1 block">Название *</label>
              <Input
                placeholder="Например: Маркетинг"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <Button
              onClick={() => (editing ? updateMutation.mutate() : createMutation.mutate())}
              disabled={!name.trim() || isBusy}
            >
              {editing ? 'Сохранить' : 'Создать'}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setShowForm(false);
                setEditing(null);
                setName('');
              }}
            >
              Отмена
            </Button>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="text-muted-foreground">Загрузка...</div>
      ) : departments.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Отделов пока нет. Создайте первый.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {departments.map((d) => (
            <Card key={d.id}>
              <CardContent className="flex items-center justify-between p-4 gap-3">
                <div>
                  <p className="font-medium">{d.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Сотрудников: {d._count?.users ?? 0}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditing(d);
                      setShowForm(false);
                      setName(d.name);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Изменить
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    disabled={isBusy}
                    onClick={() => {
                      if (!window.confirm(`Удалить отдел «${d.name}»?`)) return;
                      deleteMutation.mutate(d.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Удалить
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
