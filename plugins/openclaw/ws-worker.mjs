import { parentPort } from 'node:worker_threads';
import WebSocket from 'ws';

let ws = null;
let reconnectAttempt = 0;
let reconnectTimer = null;
let heartbeatTimer = null;
let destroyed = false;
let currentUrl = null;
let authPayload = null;

function wsSend(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ ...msg, ts: new Date().toISOString() }));
  }
}

function stopHeartbeat() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => wsSend({ type: 'heartbeat', payload: {} }), 30000);
}

function scheduleReconnect() {
  if (destroyed) return;
  const delay = Math.min(1000 * 2 ** reconnectAttempt, 30000);
  reconnectAttempt++;
  parentPort.postMessage({ type: '__log', level: 'info', msg: `[nexus-ws] Reconnecting in ${delay / 1000}s...` });
  reconnectTimer = setTimeout(() => { reconnectTimer = null; doConnect(); }, delay);
}

function doConnect() {
  if (destroyed || !currentUrl) return;
  if (ws && ws.readyState === WebSocket.OPEN) return;

  try {
    ws = new WebSocket(currentUrl);
  } catch (e) {
    parentPort.postMessage({ type: '__log', level: 'warn', msg: `[nexus-ws] Failed to create WebSocket: ${e}` });
    scheduleReconnect();
    return;
  }

  ws.on('open', () => {
    reconnectAttempt = 0;
    startHeartbeat();
    parentPort.postMessage({ type: '__connected' });
    if (authPayload) wsSend(authPayload);
  });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      parentPort.postMessage({ type: '__message', msg });
    } catch {}
  });

  ws.on('close', () => {
    stopHeartbeat();
    parentPort.postMessage({ type: '__disconnected' });
    scheduleReconnect();
  });

  ws.on('error', (err) => {
    parentPort.postMessage({ type: '__log', level: 'warn', msg: `[nexus-ws] WebSocket error: ${err.message}` });
  });
}

function disconnect() {
  stopHeartbeat();
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  reconnectAttempt = 0;
  if (ws) { ws.removeAllListeners(); ws.close(); ws = null; }
}

parentPort.on('message', (data) => {
  switch (data.type) {
    case 'connect': {
      const { serverUrl, authMsg } = data;
      authPayload = authMsg;
      if (currentUrl === serverUrl && ws && ws.readyState === WebSocket.OPEN) {
        wsSend(authMsg);
        return;
      }
      disconnect();
      currentUrl = serverUrl;
      doConnect();
      break;
    }
    case 'send': {
      wsSend(data.msg);
      break;
    }
    case 'destroy': {
      destroyed = true;
      disconnect();
      process.exit(0);
    }
  }
});
