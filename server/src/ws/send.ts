import type { WebSocket } from 'ws';
import type { ServerToAgent } from '@agent-nexus/protocol';

export function send(ws: WebSocket, message: ServerToAgent): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({ ...message, ts: new Date().toISOString() }));
  }
}
