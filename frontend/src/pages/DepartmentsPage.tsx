import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, ChevronLeft, Users } from 'lucide-react';
import { api, type Department, type User } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ROLE_LABELS, isDirectorRole } from '@/lib/utils';

const emptyForm = {
  name: '',
  parentId: '',
  headUserId: '',
};

function deptLabel(d: Department): string {
  return d.parent ? `${d.parent.name} → ${d.name}` : d.name;
}

export function DepartmentsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);

  const canView =
    user?.role === 'ADMIN' ||
    user?.role === 'HR' ||
    isDirectorRole(user?.role) ||
    user?.role === 'MANAGER';

  const canEditStructure =
    user?.role === 'ADMIN' || user?.role === 'HR' || isDirectorRole(user?.role);

  const { data: departments = [], isLoading } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: () => api.getDepartments(),
    enabled: canView,
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => api.getUsers(),
    enabled: canView,
  });

  const selectedDept = departments.find((d) => d.id === selectedDeptId) ?? null;

  const deptMembers = useMemo(() => {
    if (!selectedDeptId) return [];
    return users.filter((u) => u.departmentId === selectedDeptId);
  }, [users, selectedDeptId]);

  const childDepts = useMemo(() => {
    if (!selectedDeptId) return [];
    return departments.filter((d) => d.parentId === selectedDeptId);
  }, [departments, selectedDeptId]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['departments'] });
    queryClient.invalidateQueries({ queryKey: ['team'] });
    queryClient.invalidateQueries({ queryKey: ['users'] });
  };

  const resetForm = () => {
    setShowForm(false);
    setEditing(null);
    setForm(emptyForm);
  };

  const createMutation = useMutation({
    mutationFn: () =>
      api.createDepartment({
        name: form.name.trim(),
        parentId: form.parentId || null,
        headUserId: form.headUserId || null,
      }),
    onSuccess: () => {
      invalidate();
      resetForm();
      showToast({ title: 'Отдел создан', message: '' });
    },
    onError: (err: Error) => showToast({ title: 'Ошибка', message: err.message }),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      api.updateDepartment(editing!.id, {
        name: form.name.trim(),
        parentId: form.parentId || null,
        headUserId: form.headUserId || null,
      }),
    onSuccess: () => {
      invalidate();
      resetForm();
      showToast({ title: 'Отдел обновлён', message: '' });
    },
    onError: (err: Error) => showToast({ title: 'Ошибка', message: err.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteDepartment(id),
    onSuccess: (_data, id) => {
      invalidate();
      if (selectedDeptId === id) setSelectedDeptId(null);
      showToast({ title: 'Отдел удалён', message: '' });
    },
    onError: (err: Error) => showToast({ title: 'Ошибка', message: err.message }),
  });

  const managerCandidates = users.filter((u) =>
    ['MANAGER', 'ADMIN', 'DIRECTOR', 'ASSISTANT_DIRECTOR', 'HR'].includes(u.role),
  );

  const parentOptions = editing
    ? departments.filter((d) => d.id !== editing.id)
    : departments;

  if (!canView) {
    return <div className="text-muted-foreground">Раздел доступен руководителям и HR</div>;
  }

  const isBusy = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  if (selectedDept) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setSelectedDeptId(null)}>
            <ChevronLeft className="h-4 w-4" />
            К списку отделов
          </Button>
        </div>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">{deptLabel(selectedDept)}</h1>
            <p className="text-muted-foreground mt-1">
              {selectedDept.head
                ? `Руководитель: ${selectedDept.head.lastName} ${selectedDept.head.firstName}`
                : 'Руководитель не назначен'}
            </p>
          </div>
          {canEditStructure && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditing(selectedDept);
                setShowForm(false);
                setForm({
                  name: selectedDept.name,
                  parentId: selectedDept.parentId ?? '',
                  headUserId: selectedDept.headUserId ?? '',
                });
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
              Изменить отдел
            </Button>
          )}
        </div>

        {canEditStructure && editing?.id === selectedDept.id && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Редактировать отдел</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[180px]">
                <label className="text-xs text-muted-foreground mb-1 block">Название *</label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="flex-1 min-w-[180px]">
                <label className="text-xs text-muted-foreground mb-1 block">Родительский отдел</label>
                <select
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={form.parentId}
                  onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value }))}
                >
                  <option value="">— без родителя —</option>
                  {parentOptions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {deptLabel(d)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-[180px]">
                <label className="text-xs text-muted-foreground mb-1 block">Руководитель отдела</label>
                <select
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={form.headUserId}
                  onChange={(e) => setForm((f) => ({ ...f, headUserId: e.target.value }))}
                >
                  <option value="">— не назначен —</option>
                  {managerCandidates.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.lastName} {u.firstName}
                    </option>
                  ))}
                </select>
              </div>
              <Button onClick={() => updateMutation.mutate()} disabled={!form.name.trim() || isBusy}>
                Сохранить
              </Button>
              <Button variant="outline" onClick={resetForm}>
                Отмена
              </Button>
            </CardContent>
          </Card>
        )}

        {childDepts.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground">Подотделы</h2>
            {childDepts.map((d) => (
              <Card
                key={d.id}
                className="cursor-pointer hover:bg-muted/40 transition-colors"
                onClick={() => setSelectedDeptId(d.id)}
              >
                <CardContent className="p-4 flex justify-between items-center">
                  <div>
                    <p className="font-medium">{d.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Сотрудников: {users.filter((u) => u.departmentId === d.id).length}
                      {d.head ? ` · ${d.head.lastName} ${d.head.firstName}` : ''}
                    </p>
                  </div>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            Сотрудники отдела ({deptMembers.length})
          </h2>
          {deptMembers.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                В этом отделе пока нет сотрудников. Назначьте отдел в карточке сотрудника.
              </CardContent>
            </Card>
          ) : (
            deptMembers.map((m) => (
              <Card key={m.id}>
                <CardContent className="p-4">
                  <p className="font-medium">
                    {m.lastName} {m.firstName}
                    {selectedDept.headUserId === m.id && (
                      <span className="ml-2 text-xs text-primary font-normal">(руководитель)</span>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">{m.email}</p>
                  <p className="text-xs text-muted-foreground mt-1">{ROLE_LABELS[m.role] ?? m.role}</p>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Отделы</h1>
          <p className="text-muted-foreground">
            {canEditStructure
              ? 'Нажмите на отдел, чтобы увидеть сотрудников. Назначьте руководителя — он увидит только свою команду.'
              : 'Ваш отдел и сотрудники. Вы видите только свою команду.'}
          </p>
        </div>
        {canEditStructure && (
          <Button
            onClick={() => {
              setShowForm(!showForm);
              setEditing(null);
              setForm(emptyForm);
            }}
          >
            <Plus className="h-4 w-4" />
            Добавить
          </Button>
        )}
      </div>

      {canEditStructure && (showForm || editing) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{editing ? 'Редактировать отдел' : 'Новый отдел / подотдел'}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs text-muted-foreground mb-1 block">Название *</label>
              <Input
                placeholder="Например: Маркетинг VoLTE"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs text-muted-foreground mb-1 block">Родительский отдел</label>
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={form.parentId}
                onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value }))}
              >
                <option value="">— без родителя (главный отдел) —</option>
                {parentOptions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {deptLabel(d)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs text-muted-foreground mb-1 block">Руководитель отдела</label>
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={form.headUserId}
                onChange={(e) => setForm((f) => ({ ...f, headUserId: e.target.value }))}
              >
                <option value="">— не назначен —</option>
                {managerCandidates.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.lastName} {u.firstName}
                  </option>
                ))}
              </select>
            </div>
            <Button
              onClick={() => (editing ? updateMutation.mutate() : createMutation.mutate())}
              disabled={!form.name.trim() || isBusy}
            >
              {editing ? 'Сохранить' : 'Создать'}
            </Button>
            <Button variant="outline" onClick={resetForm}>
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
          {departments.map((d) => {
            const memberCount = users.filter((u) => u.departmentId === d.id).length;
            return (
              <Card
                key={d.id}
                className="cursor-pointer hover:bg-muted/40 transition-colors"
                onClick={() => setSelectedDeptId(d.id)}
              >
                <CardContent className="flex items-center justify-between p-4 gap-3">
                  <div>
                    <p className="font-medium">{deptLabel(d)}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Сотрудников: {memberCount}
                      {d._count?.children ? ` · Подотделов: ${d._count.children}` : ''}
                      {d.head ? ` · Руководитель: ${d.head.lastName} ${d.head.firstName}` : ''}
                    </p>
                  </div>
                  <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedDeptId(d.id)}
                    >
                      <Users className="h-3.5 w-3.5" />
                      Сотрудники
                    </Button>
                    {canEditStructure && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditing(d);
                            setShowForm(false);
                            setForm({
                              name: d.name,
                              parentId: d.parentId ?? '',
                              headUserId: d.headUserId ?? '',
                            });
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
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
