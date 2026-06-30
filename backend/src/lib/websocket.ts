import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { verifyAccessToken } from './jwt.js';

interface Client {
  ws: WebSocket;
  userId: string;
}

const clients = new Map<WebSocket, Client>();

export function initWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url ?? '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close(4001, 'Требуется токен');
      return;
    }

    try {
      const payload = verifyAccessToken(token);
      clients.set(ws, { ws, userId: payload.userId });

      ws.on('close', () => clients.delete(ws));
      ws.send(JSON.stringify({ type: 'connected', userId: payload.userId }));
    } catch {
      ws.close(4003, 'Недействительный токен');
    }
  });

  return wss;
}

export function sendToUser(userId: string, data: unknown) {
  const message = JSON.stringify(data);
  for (const client of clients.values()) {
    if (client.userId === userId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(message);
    }
  }
}

export function broadcast(data: unknown) {
  const message = JSON.stringify(data);
  for (const client of clients.values()) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(message);
    }
  }
}
