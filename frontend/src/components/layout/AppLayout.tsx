import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  FolderKanban,
  CheckSquare,
  Columns3,
  Calendar,
  BarChart3,
  Bell,
  Users,
  Settings,
  LogOut,
  Moon,
  Sun,
  Search,
  Menu,
  X,
  ClipboardList,
  UserCheck,
} from 'lucide-react';
import { SearchInput } from '@/components/tasks/TaskFormDialog';
import { NotificationBell } from '@/components/layout/NotificationBell';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/Button';
import { cn, ROLE_LABELS } from '@/lib/utils';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', roles: null },
  { to: '/projects', icon: FolderKanban, label: 'Проекты', roles: null },
  { to: '/tasks', icon: CheckSquare, label: 'Задачи', roles: null },
  { to: '/kanban', icon: Columns3, label: 'Канбан', roles: null },
  { to: '/calendar', icon: Calendar, label: 'Календарь', roles: null },
  { to: '/daily-report', icon: ClipboardList, label: 'Дневной отчёт', roles: null },
  { to: '/analytics', icon: UserCheck, label: 'Аналитика', roles: ['ADMIN', 'MANAGER', 'DIRECTOR', 'ASSISTANT_DIRECTOR'] },
  { to: '/reports', icon: BarChart3, label: 'Отчёты', roles: null },
  { to: '/team', icon: Users, label: 'Сотрудники', roles: ['ADMIN', 'MANAGER', 'HR', 'DIRECTOR', 'ASSISTANT_DIRECTOR'] },
  { to: '/notifications', icon: Bell, label: 'Уведомления', roles: null },
  { to: '/settings', icon: Settings, label: 'Настройки', roles: null },
];

export function AppLayout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen bg-background">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-sidebar transition-transform lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center gap-2 border-b border-border px-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
            RPS
          </div>
          <div>
            <div className="font-semibold text-sm">Task Manager</div>
            <div className="text-xs text-muted-foreground">Корпоративная система</div>
          </div>
          <button className="ml-auto lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 p-4">
          {navItems
            .filter((item) => !item.roles || item.roles.includes(user?.role ?? ''))
            .map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-sidebar-foreground hover:bg-accent',
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-border p-4">
          <div className="mb-3 rounded-lg bg-accent p-3">
            <div className="font-medium text-sm">
              {user?.firstName} {user?.lastName}
            </div>
            <div className="text-xs text-muted-foreground">{ROLE_LABELS[user?.role ?? '']}</div>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            Выйти
          </Button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border bg-background/95 backdrop-blur px-4 lg:px-6">
          <button className="lg:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>

          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <SearchInput onSearch={(q) => navigate(`/tasks?search=${encodeURIComponent(q)}`)} />
          </div>

          <NotificationBell />

          <Button variant="ghost" size="icon" onClick={toggleTheme}>
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </header>

        <main className="flex-1 overflow-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
