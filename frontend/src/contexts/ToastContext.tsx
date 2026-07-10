import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

export interface Toast {
  id: string;
  title: string;
  message: string;
  link?: string;
}

interface ToastContextType {
  toasts: Toast[];
  showToast: (toast: Omit<Toast, 'id'> & { id?: string }) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((toast: Omit<Toast, 'id'> & { id?: string }) => {
    const id = toast.id ?? crypto.randomUUID();
    setToasts((prev) => {
      if (prev.some((t) => t.id === id)) return prev;
      return [...prev.slice(-4), { ...toast, id }];
    });
    setTimeout(() => dismissToast(id), 6000);
  }, [dismissToast]);

  return (
    <ToastContext.Provider value={{ toasts, showToast, dismissToast }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
