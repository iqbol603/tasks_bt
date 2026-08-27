import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, MessageCircle, Pencil, Ban, CheckCircle, Trash2, Search } from 'lucide-react';
import { api, type Department } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ROLE_LABELS, isDirectorRole } from '@/lib/utils';

interface TeamMember {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  department: string | null;
  departmentId?: string | null;
  isActive: boolean;
  telegramLinked?: boolean;
}

const ROLES = ['EXECUTOR', 'MANAGER', 'OBSERVER', 'HR', 'ADMIN', 'DIRECTOR', 'ASSISTANT_DIRECTOR'];
const MANAGER_ROLES = ['EXECUTOR', 'OBSERVER'];
const CREATE_DEPT_VALUE = '__create_department__';

function canManageMember(actorRole: string | undefined, target: TeamMember, selfId?: string): boolean {
  if (!actorRole || target.id === selfId) return false;
  if (actorRole === 'ADMIN' || isDirectorRole(actorRole)) return true;
  if (actorRole === 'HR') return !['ADMIN', 'DIRECTOR', 'ASSISTANT_DIRECTOR'].includes(target.role);
  if (actorRole === 'MANAGER') return ['EXECUTOR', 'OBSERVER'].includes(target.role);
  return false;
}

function deptOptionLabel(d: Department): string {
  return d.parent ? `${d.parent.name} → ${d.name}` : d.name;
}

const emptyForm = {
  email: '',
  password: '',
  firstName: '',
  lastName: '',
  role: 'EXECUTOR',
  departmentId: '',
  isActive: true,
};

export function TeamPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [newDeptName, setNewDeptName] = useState('');
  const [showNewDept, setShowNewDept] = useState(false);
  const [search, setSearch] = useState('');

  const canManage = user?.role === 'ADMIN' || user?.role === 'HR' || isDirectorRole(user?.role) || user?.role === 'MANAGER';
  const isFullAdmin = user?.role === 'ADMIN' || user?.role === 'HR' || isDirectorRole(user?.role);
  const assignableRoles = user?.role === 'MANAGER' ? MANAGER_ROLES : ROLES;

  const { data: members = [], isLoading } = useQuery<TeamMember[]>({
    queryKey: ['team'],
    queryFn: () => api.getTeam() as Promise<TeamMember[]>,
    enabled: canManage,
  });

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: () => api.getDepartments(),
    enabled: canManage,
  });

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => {
      const hay = [
        m.firstName,
        m.lastName,
        `${m.firstName} ${m.lastName}`,
        `${m.lastName} ${m.firstName}`,
        m.email,
        m.department ?? '',
        ROLE_LABELS[m.role] ?? m.role,
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [members, search]);

  const invalidateTeam = () => {
    queryClient.invalidateQueries({ queryKey: ['team'] });
    queryClient.invalidateQueries({ queryKey: ['users'] });
    queryClient.invalidateQueries({ queryKey: ['departments'] });
  };

  const createDeptMutation = useMutation({
    mutationFn: () => api.createDepartment({ name: newDeptName.trim() }),
    onSuccess: (dept) => {
      invalidateTeam();
      setForm((f) => ({ ...f, departmentId: (dept as Department).id }));
      setShowNewDept(false);
      setNewDeptName('');
      showToast({ title: 'Отдел создан', message: (dept as Department).name });
    },
    onError: (err: Error) => showToast({ title: 'Ошибка', message: err.message }),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.createUser({
        email: form.email,
        password: form.password,
        firstName: form.firstName,
        lastName: form.lastName,
        role: form.role,
        departmentId: form.departmentId || null,
      }),
    onSuccess: (res) => {
      invalidateTeam();
      setShowForm(false);
      setForm(emptyForm);
      showToast({
        title: 'Сотрудник создан',
        message: (res as { message?: string })?.message ?? '',
      });
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
        departmentId: form.departmentId || null,
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
    setShowNewDept(false);
    setForm({
      email: m.email,
      password: '',
      firstName: m.firstName,
      lastName: m.lastName,
      role: m.role,
      departmentId: m.departmentId ?? '',
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
    return <div className="text-muted-foreground">Раздел доступен только администратору и руководителю</div>;
  }

  const isBusy =
    createMutation.isPending ||
    updateMutation.isPending ||
    deactivateMutation.isPending ||
    activateMutation.isPending ||
    deleteMutation.isPending ||
    createDeptMutation.isPending;

  const isManagerRoleSelected = form.role === 'MANAGER';
  const canSubmit =
    !!form.email &&
    !!form.firstName &&
    !!form.lastName &&
    (editing || !!form.password) &&
    !(isManagerRoleSelected && !form.departmentId) &&
    !isBusy;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Сотрудники</h1>
          <p className="text-muted-foreground">Создание, блокировка и удаление команды</p>
        </div>
        <Button onClick={() => { setShowForm(!showForm); setEditing(null); setShowNewDept(false); }}>
          <Plus className="h-4 w-4" />
          Добавить
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Поиск по имени, email, отделу…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {(showForm || editing) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{editing ? 'Редактировать сотрудника' : 'Новый сотрудник'}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Input placeholder="Имя *" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            <Input placeholder="Фамилия *" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            <Input type="email" placeholder="Email *" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="sm:col-span-2" disabled={!!editing && !isFullAdmin} />
            {(isFullAdmin || !editing) && (
              <Input
                type="password"
                placeholder={editing ? 'Новый пароль (оставьте пустым)' : 'Пароль *'}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            )}
            <div className={(isFullAdmin || !editing) ? '' : 'sm:col-span-2'}>
              <label className="text-xs text-muted-foreground mb-1 block">
                {isManagerRoleSelected
                  ? 'Отдел для привязки * (зона контроля руководителя)'
                  : 'Отдел'}
              </label>
              <select
                value={showNewDept ? CREATE_DEPT_VALUE : form.departmentId}
                onChange={(e) => {
                  if (e.target.value === CREATE_DEPT_VALUE) {
                    setShowNewDept(true);
                    return;
                  }
                  setShowNewDept(false);
                  setForm({ ...form, departmentId: e.target.value });
                }}
                className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm"
              >
                <option value="">
                  {isManagerRoleSelected ? 'Выберите отдел / подотдел…' : 'Без отдела'}
                </option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{deptOptionLabel(d)}</option>
                ))}
                <option value={CREATE_DEPT_VALUE}>+ Создать новый отдел…</option>
              </select>
              {isManagerRoleSelected && (
                <p className="text-xs text-muted-foreground mt-1">
                  Руководитель увидит задачи только сотрудников этого отдела и его подотделов.
                </p>
              )}
            </div>
            {showNewDept && (
              <div className="sm:col-span-2 flex flex-wrap gap-2 items-end">
                <div className="flex-1 min-w-[180px]">
                  <label className="text-xs text-muted-foreground mb-1 block">Название нового отдела</label>
                  <Input
                    placeholder="Например: Маркетинг VoLTE"
                    value={newDeptName}
                    onChange={(e) => setNewDeptName(e.target.value)}
                    autoFocus
                  />
                </div>
                <Button
                  type="button"
                  onClick={() => createDeptMutation.mutate()}
                  disabled={!newDeptName.trim() || createDeptMutation.isPending}
                >
                  Создать отдел
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setShowNewDept(false); setNewDeptName(''); }}
                >
                  Отмена
                </Button>
              </div>
            )}
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm sm:col-span-2"
              disabled={!!editing && !isFullAdmin}
            >
              {assignableRoles.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
            {editing && isFullAdmin && (
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
                disabled={!canSubmit}
              >
                {editing ? 'Сохранить' : 'Создать'}
              </Button>
              <Button variant="outline" onClick={() => { setShowForm(false); setEditing(null); setShowNewDept(false); }}>
                Отмена
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="text-muted-foreground">Загрузка...</div>
      ) : filteredMembers.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {search.trim() ? 'Никого не найдено по запросу' : 'Сотрудников пока нет'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredMembers.map((m) => {
            const isSelf = m.id === user?.id;
            const canEditMember = canManageMember(user?.role, m, user?.id);

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
                    <Button variant="outline" size="sm" onClick={() => openEdit(m)} disabled={!canEditMember && !isSelf}>
                      <Pencil className="h-3.5 w-3.5" />
                      Изменить
                    </Button>
                    {canEditMember && m.isActive && (
                      <Button variant="outline" size="sm" onClick={() => handleDeactivate(m)} disabled={isBusy}>
                        <Ban className="h-3.5 w-3.5" />
                        Заблокировать
                      </Button>
                    )}
                    {canEditMember && !m.isActive && (
                      <Button variant="outline" size="sm" onClick={() => activateMutation.mutate(m.id)} disabled={isBusy}>
                        <CheckCircle className="h-3.5 w-3.5" />
                        Разблокировать
                      </Button>
                    )}
                    {canEditMember && (
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
