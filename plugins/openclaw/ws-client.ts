import WebSocket from 'ws';

export type WsMessage = {
  type: string;
  payload: any;
  ts: string;
};

export type WsClientOptions = {
  serverUrl: string;
  onMessage: (msg: WsMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
  logger: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void };
};

export class NexusWsClient {
  private ws: WebSocket | null = null;
  private opts: WsClientOptions;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;

  constructor(opts: WsClientOptions) {
    this.opts = opts;
  }

  connect(): void {
    if (this.destroyed) return;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;

    try {
      this.ws = new WebSocket(this.opts.serverUrl);
    } catch (e) {
      this.opts.logger.warn(`[nexus] Failed to create WebSocket: ${e}`);
      this.scheduleReconnect();
      return;
    }

    this.ws.on('open', () => {
      this.reconnectAttempt = 0;
      this.startHeartbeat();
      this.opts.onOpen?.();
    });

    this.ws.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString()) as WsMessage;
        Promise.resolve(this.opts.onMessage(msg)).catch((err) => {
          this.opts.logger.error(`[nexus] Message handler error: ${err}`);
        });
      } catch {
        // ignore malformed messages
      }
    });

    this.ws.on('close', () => {
      this.stopHeartbeat();
      this.opts.onClose?.();
      this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      this.opts.logger.warn(`[nexus] WebSocket error: ${err.message}`);
      // close event will fire after error, triggering reconnect
    });
  }

  send(msg: Omit<WsMessage, 'ts'>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ ...msg, ts: new Date().toISOString() }));
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: 'heartbeat', payload: {} });
    }, 30_000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return;
    const delay = Math.min(1000 * 2 ** this.reconnectAttempt, 30_000);
    this.reconnectAttempt++;
    this.opts.logger.info(`[nexus] Reconnecting in ${delay / 1000}s...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}
