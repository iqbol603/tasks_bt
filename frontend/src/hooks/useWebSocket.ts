import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

export function useWebSocket() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    const token = api.getAccessToken();
    if (!token) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const port = import.meta.env.DEV ? '3001' : window.location.port;
    const ws = new WebSocket(`${protocol}//${host}:${port}/ws?token=${token}`);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'notification' && data.notification) {
          const n = data.notification;
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
          showToast({
            id: n.id,
            title: n.title,
            message: n.message,
            link: n.link ?? undefined,
          });
        }
      } catch { /* ignore */ }
    };

    ws.onclose = () => {
      setTimeout(connect, 5000);
    };

    wsRef.current = ws;
  }, [queryClient, showToast]);

  useEffect(() => {
    connect();
    return () => wsRef.current?.close();
  }, [connect]);
}
