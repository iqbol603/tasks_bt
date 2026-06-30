import { useNavigate } from 'react-router-dom';
import { X, Bell } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import { cn } from '@/lib/utils';

export function Toaster() {
  const { toasts, dismissToast } = useToast();
  const navigate = useNavigate();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-full max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'flex gap-3 rounded-xl border border-border bg-card p-4 shadow-lg',
            'animate-in slide-in-from-right duration-300',
          )}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Bell className="h-4 w-4" />
          </div>
          <div
            className="flex-1 min-w-0 cursor-pointer"
            onClick={() => {
              if (toast.link) navigate(toast.link);
              dismissToast(toast.id);
            }}
          >
            <p className="font-medium text-sm">{toast.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{toast.message}</p>
          </div>
          <button
            onClick={() => dismissToast(toast.id)}
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
