import type { WebSocket } from 'ws';
import type { AgentToServer, RegisterPayload, AuthPayload } from '@agent-nexus/protocol';
import { send } from './send.js';
import { addConnection, removeConnection, getConnectionBySocket, getConnectionByAgentId } from './state.js';
import { getSkillsForRole } from '../skills/reader.js';
import * as dao from '../db/dao.js';

const AUTH_TIMEOUT_MS = 5_000;
const MASTER_TOKEN = process.env.MASTER_TOKEN || '';

export function handleConnection(ws: WebSocket): void {
  let authenticated = false;

  const authTimer = setTimeout(() => {
    if (!authenticated) {
      send(ws, { type: 'error', payload: { reason: 'Auth timeout' }, ts: '' });
      ws.close();
    }
  }, AUTH_TIMEOUT_MS);

  ws.on('message', async (raw: Buffer) => {
    try {
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
    } catch (err) {
      console.error('[ws] Message handler error:', err);
      send(ws, { type: 'error', payload: { reason: 'Internal server error' }, ts: '' });
    }
  });

  ws.on('close', async () => {
    try {
      clearTimeout(authTimer);
      const conn = removeConnection(ws);
      if (conn && conn.state === 'active') {
        await dao.setAgentOffline(conn.agentId);
      }
    } catch (err) {
      console.error('[ws] Close handler error:', err);
    }
  });
}

async function handleRegister(ws: WebSocket, payload: RegisterPayload): Promise<void> {
  const hasMasterToken = MASTER_TOKEN && payload.masterToken === MASTER_TOKEN;

  // Check if agent already exists (any status)
  const existing = await dao.findAgentByIdentity(payload.name, payload.agentType, payload.role);

  if (existing) {
    // Master token can reactivate rejected/revoked agents
    if (hasMasterToken && existing.status !== 'active') {
      await dao.updateAgentStatus(existing.id, 'active');
      addConnection(ws, { agentId: existing.id, role: existing.role, state: 'active' });
      await dao.setAgentOnline(existing.id);
      const skills = await getSkillsForRole(existing.role);
      send(ws, {
        type: 'register.approved',
        payload: { apiKey: existing.api_key, agentId: existing.id, name: existing.name, role: existing.role, skills },
        ts: '',
      });
      return;
    }
    // Already approved — treat as auth, return approved with api_key
    if (existing.status === 'active') {
      addConnection(ws, { agentId: existing.id, role: existing.role, state: 'active' });
      await dao.setAgentOnline(existing.id);
      const skills = await getSkillsForRole(existing.role);
      send(ws, {
        type: 'register.approved',
        payload: { apiKey: existing.api_key, agentId: existing.id, name: existing.name, role: existing.role, skills },
        ts: '',
      });
      return;
    }

    // Still pending �� reconnect to existing registration
    if (existing.status === 'pending_approval') {
      addConnection(ws, { agentId: existing.id, role: existing.role, state: 'pending_approval' });
      send(ws, {
        type: 'register.pending',
        payload: { agentId: existing.id, message: 'Awaiting admin approval (reconnected)' },
        ts: '',
      });
      return;
    }

    // Rejected or revoked — deny
    send(ws, { type: 'register.rejected', payload: { reason: `Agent was ${existing.status}` }, ts: '' });
    ws.close();
    return;
  }

  // New agent — create
  const agent = await dao.createAgent({
    name: payload.name,
    agentType: payload.agentType,
    role: payload.role,
    hostname: payload.hostname,
    mac: payload.mac,
    os: payload.os,
  });

  // Master token: auto-approve immediately
  if (hasMasterToken) {
    await dao.updateAgentStatus(agent.id, 'active');
    addConnection(ws, { agentId: agent.id, role: agent.role, state: 'active' });
    await dao.setAgentOnline(agent.id);
    const skills = await getSkillsForRole(agent.role);
    send(ws, {
      type: 'register.approved',
      payload: { apiKey: agent.api_key, agentId: agent.id, name: agent.name, role: agent.role, skills },
      ts: '',
    });
    return;
  }

  // No master token — pend for admin approval
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

  const skills = await getSkillsForRole(agent.role);
  send(ws, {
    type: 'auth.ok',
    payload: { agentId: agent.id, name: agent.name, role: agent.role, skills },
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

  const skills = await getSkillsForRole(agent.role);
  send(agentConn.ws, {
    type: 'register.approved',
    payload: { apiKey: agent.api_key, agentId: agent.id, name: agent.name, role: agent.role, skills },
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
