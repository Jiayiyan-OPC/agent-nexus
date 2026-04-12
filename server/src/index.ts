import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { handleConnection } from './ws/handler.js';
import { startHeartbeatMonitor } from './ws/heartbeat.js';
import { watchConventions } from './conventions/watcher.js';
import { getAllActiveConnections, getOnlineAgentsByRole } from './ws/state.js';
import { send } from './ws/send.js';
import { requireAuth } from './api/auth-middleware.js';
import { agentsRouter } from './api/agents.js';
import { statusRouter } from './api/status.js';
import { conventionsRouter } from './api/conventions.js';
import { authRouter } from './api/auth.js';

const app = express();
app.use(cors());
app.use(express.json());

// Auth (no auth required)
app.use('/api/auth', authRouter);

// REST API (auth required)
app.use('/api/agents', requireAuth, agentsRouter);
app.use('/api/status', requireAuth, statusRouter);
app.use('/api/conventions', requireAuth, conventionsRouter);

// Health check
app.get('/health', (_req, res) => res.json({ ok: true }));

const server = createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', handleConnection);

startHeartbeatMonitor();

watchConventions((event) => {
  if (event.scope === 'global') {
    for (const conn of getAllActiveConnections()) {
      send(conn.ws, { type: 'conventions.update', payload: { scope: 'global', files: event.files }, ts: '' });
    }
  } else if (event.role) {
    for (const conn of getOnlineAgentsByRole(event.role)) {
      send(conn.ws, { type: 'conventions.update', payload: { scope: 'role', files: event.files }, ts: '' });
    }
  }
});

const PORT = parseInt(process.env.PORT ?? '3000', 10);
server.listen(PORT, () => {
  console.log(`Agent Nexus server running on port ${PORT}`);
});
