import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { handleConnection } from './ws/handler.js';
import { startHeartbeatMonitor } from './ws/heartbeat.js';
import { startHeartbeatFlush, onStatusChange } from './ws/status-cache.js';
import { startAuditWriter } from './events/audit.js';
import { startRateLimitCleanup } from './events/rate-limit.js';
import { watchSkills } from './skills/watcher.js';
import { getAllActiveConnections, getOnlineAgentsByRole } from './ws/state.js';
import { send } from './ws/send.js';
import { requireAuth } from './api/auth-middleware.js';
import { agentsRouter } from './api/agents.js';
import { statusRouter } from './api/status.js';
import { skillsRouter } from './api/skills.js';
import { authRouter } from './api/auth.js';
import { supabase } from './db/supabase.js';

const app = express();
app.use(cors());
app.use(express.json());

// Auth (no auth required)
app.use('/api/auth', authRouter);

// REST API (auth required)
app.use('/api/agents', requireAuth, agentsRouter);
app.use('/api/status', requireAuth, statusRouter);
app.use('/api/skills', requireAuth, skillsRouter);

// Health check
app.get('/health', (_req, res) => res.json({ ok: true }));

const server = createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', handleConnection);

startHeartbeatMonitor();

// Start event audit writer (batched, 200ms flush)
startAuditWriter();

// Start rate limit bucket cleanup (every 5 min)
startRateLimitCleanup();

// Periodic heartbeat flush to DB (every 60s)
startHeartbeatFlush(60_000);

// Broadcast status changes via Supabase Realtime broadcast channel
const broadcastChannel = supabase.channel('agent-status-changes');
broadcastChannel.subscribe();
onStatusChange((agentId, status) => {
  broadcastChannel.send({
    type: 'broadcast',
    event: 'status-change',
    payload: {
      agentId,
      status: status.status,
      activeSessions: status.activeSessions,
      totalTokenUsed: status.totalTokenUsed,
      timestamp: new Date().toISOString(),
    },
  }).catch((err: unknown) => {
    console.error('[broadcast] Failed to broadcast status change:', err);
  });
});

watchSkills((event) => {
  if (event.scope === 'global') {
    for (const conn of getAllActiveConnections()) {
      send(conn.ws, { type: 'skills.update', payload: { scope: 'global', files: event.files }, ts: '' });
    }
  } else if (event.role) {
    for (const conn of getOnlineAgentsByRole(event.role)) {
      send(conn.ws, { type: 'skills.update', payload: { scope: 'role', files: event.files }, ts: '' });
    }
  }
});

const PORT = parseInt(process.env.PORT ?? '9000', 10);
server.listen(PORT, () => {
  console.log(`Agent Nexus server running on port ${PORT}`);
});
