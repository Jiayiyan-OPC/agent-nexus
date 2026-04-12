import type { WebSocket } from 'ws';
import type { AgentToServer, RegisterPayload, AuthPayload } from '@agent-nexus/protocol';
import { send } from './send.js';
import { addConnection, removeConnection, getConnectionBySocket, getConnectionByAgentId } from './state.js';
import { getConventionsForRole } from '../conventions/reader.js';
import * as dao from '../db/dao.js';

const AUTH_TIMEOUT_MS = 5_000;

export function handleConnection(ws: WebSocket): void {
  let authenticated = false;

  const authTimer = setTimeout(() => {
    if (!authenticated) {
      send(ws, { type: 'error', payload: { reason: 'Auth timeout' }, ts: '' });
      ws.close();
    }
  }, AUTH_TIMEOUT_MS);

  ws.on('message', async (raw: Buffer) => {
    let msg: AgentToServer;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      send(ws, { type: 'error', payload: { reason: 'Invalid JSON' }, ts: '' });
      return;
    }

    const conn = getConnectionBySocket(ws);

    // Unauthenticated
    if (!conn) {
      if (msg.type === 'register') {
        await handleRegister(ws, msg.payload);
        authenticated = true;
        clearTimeout(authTimer);
      } else if (msg.type === 'auth') {
        const ok = await handleAuth(ws, msg.payload);
        if (ok) {
          authenticated = true;
          clearTimeout(authTimer);
        }
      } else {
        send(ws, { type: 'error', payload: { reason: 'Not authenticated' }, ts: '' });
      }
      return;
    }

    // Pending: only heartbeat
    if (conn.state === 'pending_approval') {
      if (msg.type === 'heartbeat') {
        conn.lastHeartbeat = Date.now();
        send(ws, { type: 'heartbeat.ack', payload: {}, ts: '' });
      }
      return;
    }

    // Active: all operations
    switch (msg.type) {
      case 'heartbeat':
        conn.lastHeartbeat = Date.now();
        await dao.updateHeartbeat(conn.agentId);
        send(ws, { type: 'heartbeat.ack', payload: {}, ts: '' });
        break;
      case 'session.start':
        await dao.createSession({
          id: msg.payload.sessionId,
          agentId: conn.agentId,
          taskName: msg.payload.taskName,
          tokenLimit: msg.payload.tokenLimit,
        });
        break;
      case 'session.update':
        await dao.updateSession(msg.payload.sessionId, {
          tokenUsed: msg.payload.tokenUsed,
          taskName: msg.payload.taskName,
        });
        break;
      case 'session.end':
        await dao.endSession(msg.payload.sessionId, msg.payload.status, msg.payload.tokenUsed);
        break;
      default:
        send(ws, { type: 'error', payload: { reason: `Unknown message type: ${(msg as any).type}` }, ts: '' });
    }
  });

  ws.on('close', async () => {
    clearTimeout(authTimer);
    const conn = removeConnection(ws);
    if (conn && conn.state === 'active') {
      await dao.setAgentOffline(conn.agentId);
    }
  });
}

async function handleRegister(ws: WebSocket, payload: RegisterPayload): Promise<void> {
  const existing = await dao.findPendingAgent(payload.name, payload.agentType, payload.role);
  if (existing) {
    addConnection(ws, { agentId: existing.id, role: existing.role, state: 'pending_approval' });
    send(ws, {
      type: 'register.pending',
      payload: { agentId: existing.id, message: 'Awaiting admin approval (reconnected to existing registration)' },
      ts: '',
    });
    return;
  }

  const agent = await dao.createAgent({
    name: payload.name,
    agentType: payload.agentType,
    role: payload.role,
    hostname: payload.hostname,
    mac: payload.mac,
    os: payload.os,
  });

  addConnection(ws, { agentId: agent.id, role: agent.role, state: 'pending_approval' });
  send(ws, {
    type: 'register.pending',
    payload: { agentId: agent.id, message: 'Awaiting admin approval' },
    ts: '',
  });
}

async function handleAuth(ws: WebSocket, payload: AuthPayload): Promise<boolean> {
  const agent = await dao.getAgentByApiKey(payload.apiKey);
  if (!agent || agent.status !== 'active') {
    send(ws, { type: 'auth.fail', payload: { reason: agent ? 'Agent not active' : 'Invalid API key' }, ts: '' });
    ws.close();
    return false;
  }

  // Update device info if provided
  if (payload.hostname || payload.mac || payload.os) {
    const { supabase } = await import('../db/supabase.js');
    await supabase
      .from('agents')
      .update({
        hostname: payload.hostname ?? agent.hostname,
        mac_address: payload.mac ?? agent.mac_address,
        os: payload.os ?? agent.os,
      })
      .eq('id', agent.id);
  }

  addConnection(ws, { agentId: agent.id, role: agent.role, state: 'active' });
  await dao.setAgentOnline(agent.id);

  const conventions = await getConventionsForRole(agent.role);
  send(ws, {
    type: 'auth.ok',
    payload: { agentId: agent.id, name: agent.name, role: agent.role, conventions },
    ts: '',
  });
  return true;
}

// Called by REST API when admin approves an agent
export async function notifyAgentApproved(agentId: string): Promise<void> {
  const agentConn = getConnectionByAgentId(agentId);
  if (!agentConn) return;

  const agent = await dao.getAgentById(agentId);
  if (!agent) return;

  agentConn.state = 'active';
  await dao.setAgentOnline(agentId);

  const conventions = await getConventionsForRole(agent.role);
  send(agentConn.ws, {
    type: 'register.approved',
    payload: { apiKey: agent.api_key, agentId: agent.id, name: agent.name, role: agent.role, conventions },
    ts: '',
  });
}

export async function notifyAgentRejected(agentId: string, reason: string): Promise<void> {
  const agentConn = getConnectionByAgentId(agentId);
  if (!agentConn) return;

  send(agentConn.ws, {
    type: 'register.rejected',
    payload: { reason },
    ts: '',
  });
  agentConn.ws.close();
}
