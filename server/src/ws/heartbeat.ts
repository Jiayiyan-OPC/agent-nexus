import { getAllActiveConnections, removeConnection } from './state.js';
import * as dao from '../db/dao.js';

const OFFLINE_THRESHOLD_MS = 90_000;

let intervalId: ReturnType<typeof setInterval> | null = null;

export function startHeartbeatMonitor(): void {
  intervalId = setInterval(async () => {
    const now = Date.now();
    for (const conn of getAllActiveConnections()) {
      if (now - conn.lastHeartbeat > OFFLINE_THRESHOLD_MS) {
        console.log(`Agent ${conn.agentId} heartbeat timeout, disconnecting`);
        conn.ws.close();
        removeConnection(conn.ws);
        await dao.setAgentOffline(conn.agentId);
      }
    }
  }, 30_000);
}

export function stopHeartbeatMonitor(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
