import * as dao from '../db/dao.js';
import type { AgentEventState } from '@agent-nexus/protocol';

interface AuditEntry {
  eventId: string;
  correlationId?: string;
  threadId?: string;
  eventType: string;
  sourceAgentId?: string;
  targetAgentId?: string;
  sourceContext?: Record<string, unknown>;
  payload: Record<string, unknown>;
  state: AgentEventState;
  errorMessage?: string;
}

const FLUSH_INTERVAL_MS = 200;
const FLUSH_THRESHOLD = 50;

let buffer: AuditEntry[] = [];
let timer: ReturnType<typeof setInterval> | null = null;
let isFlushing = false;

async function flush(): Promise<void> {
  if (isFlushing || buffer.length === 0) return;
  isFlushing = true;
  const batch = buffer.splice(0);
  try {
    const results = await Promise.allSettled(
      batch.map(entry => dao.insertEventAudit(entry)),
    );
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'rejected') {
        console.error('[audit] Failed to write event audit:', (results[i] as PromiseRejectedResult).reason);
      }
    }
  } finally {
    isFlushing = false;
  }
}

export function enqueueAudit(entry: AuditEntry): void {
  buffer.push(entry);
  if (buffer.length >= FLUSH_THRESHOLD) {
    flush().catch(() => {});
  }
}

export function startAuditWriter(): void {
  if (timer) return;
  timer = setInterval(() => {
    flush().catch(() => {});
  }, FLUSH_INTERVAL_MS);
  // Don't keep process alive just for audit flushing
  if (timer && typeof timer === 'object' && 'unref' in timer) {
    timer.unref();
  }
}

export function stopAuditWriter(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  // Final flush
  flush().catch(() => {});
}
