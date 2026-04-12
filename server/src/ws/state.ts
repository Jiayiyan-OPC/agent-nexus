import type { WebSocket } from 'ws';

export interface ConnectedAgent {
  ws: WebSocket;
  agentId: string;
  role: string;
  state: 'unauthenticated' | 'pending_approval' | 'active';
  lastHeartbeat: number;
}

const agents = new Map<string, ConnectedAgent>();
const wsBySocket = new Map<WebSocket, ConnectedAgent>();

export function addConnection(ws: WebSocket, agent: Omit<ConnectedAgent, 'ws' | 'lastHeartbeat'>): ConnectedAgent {
  const conn: ConnectedAgent = { ...agent, ws, lastHeartbeat: Date.now() };
  agents.set(agent.agentId, conn);
  wsBySocket.set(ws, conn);
  return conn;
}

export function removeConnection(ws: WebSocket): ConnectedAgent | undefined {
  const conn = wsBySocket.get(ws);
  if (conn) {
    agents.delete(conn.agentId);
    wsBySocket.delete(ws);
  }
  return conn;
}

export function getConnectionBySocket(ws: WebSocket): ConnectedAgent | undefined {
  return wsBySocket.get(ws);
}

export function getConnectionByAgentId(agentId: string): ConnectedAgent | undefined {
  return agents.get(agentId);
}

export function getOnlineAgentsByRole(role: string): ConnectedAgent[] {
  return Array.from(agents.values()).filter(a => a.role === role && a.state === 'active');
}

export function getAllActiveConnections(): ConnectedAgent[] {
  return Array.from(agents.values()).filter(a => a.state === 'active');
}
