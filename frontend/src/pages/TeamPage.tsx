import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, MessageCircle, Pencil, Ban, CheckCircle, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ROLE_LABELS } from '@/lib/utils';

interface TeamMember {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  department: string | null;
  isActive: boolean;
  telegramLinked?: boolean;
}

const ROLES = ['EXECUTOR', 'MANAGER', 'OBSERVER', 'HR', 'ADMIN', 'DIRECTOR'];

const emptyForm = {
  email: '',
  password: '',
  firstName: '',
  lastName: '',
  role: 'EXECUTOR',
  department: '',
  isActive: true,
};

export function TeamPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [form, setForm] = useState(emptyForm);

  const canManage = user?.role === 'ADMIN' || user?.role === 'HR' || user?.role === 'DIRECTOR';

  const { data: members = [], isLoading } = useQuery<TeamMember[]>({
    queryKey: ['team'],
    queryFn: () => api.getTeam() as Promise<TeamMember[]>,
    enabled: canManage,
  });

  const invalidateTeam = () => {
    queryClient.invalidateQueries({ queryKey: ['team'] });
    queryClient.invalidateQueries({ queryKey: ['users'] });
  };

  const createMutation = useMutation({
    mutationFn: () => api.createUser(form),
    onSuccess: () => {
      invalidateTeam();
      setShowForm(false);
      setForm(emptyForm);
      showToast({ title: 'Сотрудник создан', message: '' });
    },
    onError: (err: Error) => showToast({ title: 'Ошибка', message: err.message }),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      api.updateUser(editing!.id, {
        email: form.email,
        firstName: form.firstName,
        lastName: form.lastName,
        role: form.role,
        department: form.department || null,
        isActive: form.isActive,
        ...(form.password ? { password: form.password } : {}),
      }),
    onSuccess: () => {
      invalidateTeam();
      setEditing(null);
      setForm(emptyForm);
      showToast({ title: 'Изменения сохранены', message: '' });
    },
    onError: (err: Error) => showToast({ title: 'Ошибка', message: err.message }),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => api.deactivateUser(id),
    onSuccess: () => {
      invalidateTeam();
      showToast({ title: 'Сотрудник заблокирован', message: 'Вход в систему запрещён' });
    },
    onError: (err: Error) => showToast({ title: 'Ошибка', message: err.message }),
  });

  const activateMutation = useMutation({
    mutationFn: (id: string) => api.activateUser(id),
    onSuccess: () => {
      invalidateTeam();
      showToast({ title: 'Сотрудник разблокирован', message: '' });
    },
    onError: (err: Error) => showToast({ title: 'Ошибка', message: err.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteUser(id),
    onSuccess: () => {
      invalidateTeam();
      setEditing(null);
      showToast({ title: 'Сотрудник удалён', message: '' });
    },
    onError: (err: Error) => showToast({ title: 'Ошибка', message: err.message }),
  });

  const openEdit = (m: TeamMember) => {
    setEditing(m);
    setShowForm(false);
    setForm({
      email: m.email,
      password: '',
      firstName: m.firstName,
      lastName: m.lastName,
      role: m.role,
      department: m.department ?? '',
      isActive: m.isActive,
    });
  };

  const handleDelete = (m: TeamMember) => {
    const name = `${m.firstName} ${m.lastName}`;
    if (!window.confirm(`Удалить сотрудника «${name}»?\n\nАккаунт будет заблокирован, email освобождён, задачи и история сохранятся.`)) {
      return;
    }
    deleteMutation.mutate(m.id);
  };

  const handleDeactivate = (m: TeamMember) => {
    const name = `${m.firstName} ${m.lastName}`;
    if (!window.confirm(`Заблокировать «${name}»?\n\nСотрудник не сможет войти в систему.`)) {
      return;
    }
    deactivateMutation.mutate(m.id);
  };

  if (!canManage) {
    return <div className="text-muted-foreground">Раздел доступен только администратору и HR</div>;
  }

  const isBusy =
    createMutation.isPending ||
    updateMutation.isPending ||
    deactivateMutation.isPending ||
    activateMutation.isPending ||
    deleteMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Сотрудники</h1>
          <p className="text-muted-foreground">Создание, блокировка и удаление команды</p>
        </div>
        <Button onClick={() => { setShowForm(!showForm); setEditing(null); }}>
          <Plus className="h-4 w-4" />
          Добавить
        </Button>
      </div>

      {(showForm || editing) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{editing ? 'Редактировать сотрудника' : 'Новый сотрудник'}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Input placeholder="Имя *" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            <Input placeholder="Фамилия *" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            <Input type="email" placeholder="Email *" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="sm:col-span-2" />
            <Input
              type="password"
              placeholder={editing ? 'Новый пароль (оставьте пустым)' : 'Пароль *'}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            <Input placeholder="Отдел" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm sm:col-span-2"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
            {editing && (
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                />
                Активен (может входить в систему)
              </label>
            )}
            <div className="flex gap-2 sm:col-span-2">
              <Button
                onClick={() => (editing ? updateMutation.mutate() : createMutation.mutate())}
                disabled={
                  !form.email || !form.firstName || !form.lastName ||
                  (!editing && !form.password) ||
                  isBusy
                }
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
      ) : (
        <div className="space-y-2">
          {members.map((m) => {
            const isSelf = m.id === user?.id;

            return (
              <Card key={m.id} className={!m.isActive ? 'opacity-60 border-destructive/30' : ''}>
                <CardContent className="flex items-center justify-between p-4 flex-wrap gap-3">
                  <div>
                    <p className="font-medium">
                      {m.firstName} {m.lastName}
                      {isSelf && <span className="text-xs text-muted-foreground ml-2">(вы)</span>}
                      {!m.isActive && <span className="text-xs text-destructive ml-2">(заблокирован)</span>}
                    </p>
                    <p className="text-sm text-muted-foreground">{m.email}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {ROLE_LABELS[m.role]}{m.department ? ` · ${m.department}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`flex items-center gap-1 text-xs ${m.telegramLinked ? 'text-green-600' : 'text-muted-foreground'}`}>
                      <MessageCircle className="h-3.5 w-3.5" />
                      {m.telegramLinked ? 'TG ✓' : 'TG ✗'}
                    </span>
                    <Button variant="outline" size="sm" onClick={() => openEdit(m)}>
                      <Pencil className="h-3.5 w-3.5" />
                      Изменить
                    </Button>
                    {!isSelf && m.isActive && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeactivate(m)}
                        disabled={isBusy}
                      >
                        <Ban className="h-3.5 w-3.5" />
                        Заблокировать
                      </Button>
                    )}
                    {!isSelf && !m.isActive && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => activateMutation.mutate(m.id)}
                        disabled={isBusy}
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                        Разблокировать
                      </Button>
                    )}
                    {!isSelf && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(m)}
                        disabled={isBusy}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Удалить
                      </Button>
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
