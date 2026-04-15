import type { OnlineStatus } from '@agent-nexus/protocol';
import * as dao from '../db/dao.js';

// --- Types ---

export interface CachedStatus {
  status: OnlineStatus;
  activeSessions: number;
  totalTokenUsed: number;
  lastHeartbeat: number; // epoch ms
}

// --- In-memory cache ---

const cache = new Map<string, CachedStatus>();

// Callback for broadcasting changes (set by caller)
let broadcastFn: ((agentId: string, status: CachedStatus) => void) | null = null;

export function onStatusChange(fn: (agentId: string, status: CachedStatus) => void): void {
  broadcastFn = fn;
}

// --- Public API ---

/**
 * Initialize cache entry when agent comes online.
 */
export function initAgent(agentId: string, initial?: Partial<CachedStatus>): void {
  cache.set(agentId, {
    status: initial?.status ?? 'online',
    activeSessions: initial?.activeSessions ?? 0,
    totalTokenUsed: initial?.totalTokenUsed ?? 0,
    lastHeartbeat: Date.now(),
  });
}

/**
 * Remove cache entry when agent disconnects.
 */
export function removeAgent(agentId: string): void {
  cache.delete(agentId);
}

/**
 * Heartbeat: only update in-memory timestamp, no DB write.
 */
export function updateHeartbeat(agentId: string): void {
  const entry = cache.get(agentId);
  if (entry) {
    entry.lastHeartbeat = Date.now();
  }
}

/**
 * Update status fields. Compares old vs new on key fields (status, activeSessions).
 * If changed: write DB + broadcast. If not: silent update in memory only.
 * Returns true if a meaningful change occurred.
 */
export async function updateStatus(
  agentId: string,
  fields: Partial<CachedStatus>,
): Promise<boolean> {
  const old = cache.get(agentId);
  if (!old) {
    // Agent not in cache (shouldn't happen in normal flow), init and write
    const entry: CachedStatus = {
      status: fields.status ?? 'online',
      activeSessions: fields.activeSessions ?? 0,
      totalTokenUsed: fields.totalTokenUsed ?? 0,
      lastHeartbeat: Date.now(),
    };
    cache.set(agentId, entry);
    await writeToDB(agentId, entry);
    broadcastFn?.(agentId, entry);
    return true;
  }

  const merged: CachedStatus = {
    status: fields.status ?? old.status,
    activeSessions: fields.activeSessions ?? old.activeSessions,
    totalTokenUsed: fields.totalTokenUsed ?? old.totalTokenUsed,
    lastHeartbeat: fields.lastHeartbeat ?? old.lastHeartbeat,
  };

  // Compare key fields that matter for UI
  const changed =
    old.status !== merged.status ||
    old.activeSessions !== merged.activeSessions;

  cache.set(agentId, merged);

  if (changed) {
    await writeToDB(agentId, merged);
    broadcastFn?.(agentId, merged);
  }

  return changed;
}

/**
 * Get cached status for an agent.
 */
export function getCachedStatus(agentId: string): CachedStatus | undefined {
  return cache.get(agentId);
}

/**
 * Get all cached statuses (for batch operations).
 */
export function getAllCachedStatuses(): Map<string, CachedStatus> {
  return cache;
}

// --- DB write helper ---

async function writeToDB(agentId: string, entry: CachedStatus): Promise<void> {
  try {
    if (entry.status === 'offline') {
      await dao.setAgentOffline(agentId);
    } else {
      // Use the full status update via agent_status table
      const { supabase } = await import('../db/supabase.js');
      await supabase
        .from('agent_status')
        .update({
          status: entry.status,
          active_sessions: entry.activeSessions,
          total_token_used: entry.totalTokenUsed,
          last_heartbeat: new Date(entry.lastHeartbeat).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('agent_id', agentId);
    }
  } catch (err) {
    console.error(`[status-cache] Failed to write DB for agent ${agentId}:`, err);
  }
}

// --- Periodic heartbeat flush ---

let flushTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start periodic flush of heartbeat timestamps to DB.
 * This batches heartbeat writes to reduce DB load.
 */
export function startHeartbeatFlush(intervalMs: number = 60_000): void {
  if (flushTimer) return;
  flushTimer = setInterval(async () => {
    const entries = Array.from(cache.entries());
    if (entries.length === 0) return;

    try {
      const { supabase } = await import('../db/supabase.js');
      // Batch update: one query per agent (Supabase doesn't support multi-row UPDATE easily)
      // But we only flush online agents, so count is bounded
      const promises = entries
        .filter(([, entry]) => entry.status === 'online')
        .map(([agentId, entry]) =>
          supabase
            .from('agent_status')
            .update({
              last_heartbeat: new Date(entry.lastHeartbeat).toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('agent_id', agentId)
        );
      await Promise.allSettled(promises);
    } catch (err) {
      console.error('[status-cache] Heartbeat flush failed:', err);
    }
  }, intervalMs);
}

export function stopHeartbeatFlush(): void {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}
