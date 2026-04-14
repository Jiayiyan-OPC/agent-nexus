import { Worker } from 'node:worker_threads';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export type WsMessage = {
  type: string;
  payload: any;
  ts: string;
};

export type WsClientOptions = {
  onMessage: (msg: WsMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
  logger: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void };
};

export class NexusWsClient {
  private worker: Worker | null = null;
  private opts: WsClientOptions;
  private _connected = false;

  constructor(opts: WsClientOptions) {
    this.opts = opts;
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;

    const workerPath = join(dirname(fileURLToPath(import.meta.url)), 'ws-worker.mjs');
    this.worker = new Worker(workerPath);

    this.worker.on('message', (data: any) => {
      if (data.type === '__connected') {
        this._connected = true;
        this.opts.onOpen?.();
      } else if (data.type === '__disconnected') {
        this._connected = false;
        this.opts.onClose?.();
      } else if (data.type === '__message') {
        this.opts.onMessage(data.msg);
      } else if (data.type === '__log') {
        const level = data.level as 'info' | 'warn' | 'error';
        this.opts.logger[level]?.(data.msg);
      }
    });

    this.worker.on('error', (err) => {
      this.opts.logger.warn(`[nexus] Worker error: ${err.message}`);
    });

    this.worker.on('exit', (code) => {
      this._connected = false;
      this.worker = null;
      if (code !== 0) {
        this.opts.logger.warn(`[nexus] Worker exited with code ${code}`);
      }
    });

    this.worker.unref();
    return this.worker;
  }

  /**
   * Connect to server and send initial auth/register message.
   * Idempotent — if already connected to same URL, re-sends auth.
   */
  connect(serverUrl: string, authMsg: { type: string; payload: any }): void {
    this.ensureWorker().postMessage({ type: 'connect', serverUrl, authMsg });
  }

  send(msg: Omit<WsMessage, 'ts'>): void {
    this.worker?.postMessage({ type: 'send', msg });
  }

  destroy(): void {
    this.worker?.postMessage({ type: 'destroy' });
    this.worker = null;
    this._connected = false;
  }

  get connected(): boolean {
    return this._connected;
  }
}
