import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ROLE_LABELS } from '@/lib/utils';
import { MessageCircle, Mail, HardDrive, Check, X } from 'lucide-react';

interface Integrations {
  email: boolean;
  telegram: boolean;
  minio: boolean;
}

interface TelegramStatus {
  linked: boolean;
  linkCode: string | null;
  botUsername: string | null;
}

export function SettingsPage() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const queryClient = useQueryClient();

  const { data: integrations } = useQuery<Integrations>({
    queryKey: ['integrations'],
    queryFn: () => api.getIntegrations() as Promise<Integrations>,
  });

  const { data: telegram } = useQuery<TelegramStatus>({
    queryKey: ['telegram-status'],
    queryFn: () => api.getTelegramStatus() as Promise<TelegramStatus>,
  });

  const linkCodeMutation = useMutation({
    mutationFn: () => api.generateTelegramLinkCode() as Promise<{ code: string; botUsername: string }>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['telegram-status'] }),
  });

  const unlinkMutation = useMutation({
    mutationFn: () => api.unlinkTelegram(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['telegram-status'] }),
  });

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Настройки</h1>
        <p className="text-muted-foreground">Профиль и параметры приложения</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Профиль</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Имя</span>
            <span>{user?.firstName} {user?.lastName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Email</span>
            <span>{user?.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Роль</span>
            <span>{ROLE_LABELS[user?.role ?? '']}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Интеграции</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Email уведомления</span>
            </div>
            {integrations?.email ? (
              <span className="flex items-center gap-1 text-xs text-green-600"><Check className="h-3 w-3" /> Настроено</span>
            ) : (
              <span className="text-xs text-muted-foreground">SMTP не настроен</span>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">MinIO хранилище</span>
            </div>
            {integrations?.minio ? (
              <span className="flex items-center gap-1 text-xs text-green-600"><Check className="h-3 w-3" /> Подключено</span>
            ) : (
              <span className="text-xs text-muted-foreground">Локальные файлы</span>
            )}
          </div>

          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Telegram Bot</span>
              </div>
              {telegram?.linked ? (
                <span className="flex items-center gap-1 text-xs text-green-600"><Check className="h-3 w-3" /> Привязан</span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-muted-foreground"><X className="h-3 w-3" /> Не привязан</span>
              )}
            </div>

            {!integrations?.telegram ? (
              <p className="text-xs text-muted-foreground">Бот не настроен на сервере (TELEGRAM_BOT_TOKEN)</p>
            ) : telegram?.linked ? (
              <Button variant="outline" size="sm" onClick={() => unlinkMutation.mutate()}>
                Отключить Telegram
              </Button>
            ) : (
              <div className="space-y-2">
                <Button size="sm" onClick={() => linkCodeMutation.mutate()} disabled={linkCodeMutation.isPending}>
                  Получить код привязки
                </Button>
                {(linkCodeMutation.data?.code || telegram?.linkCode) && (
                  <div className="rounded-lg bg-accent p-3 text-sm">
                    <p className="font-mono font-bold text-lg mb-2">
                      {linkCodeMutation.data?.code ?? telegram?.linkCode}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Отправьте боту {telegram?.botUsername ? `@${telegram.botUsername}` : ''} команду:
                    </p>
                    <p className="font-mono text-xs mt-1">
                      /link {linkCodeMutation.data?.code ?? telegram?.linkCode}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Внешний вид</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <span className="text-sm">Тема оформления</span>
            <Button variant="outline" onClick={toggleTheme}>
              {theme === 'dark' ? 'Тёмная' : 'Светлая'} → переключить
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
