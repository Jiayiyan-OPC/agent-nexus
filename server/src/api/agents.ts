import { Router, type IRouter } from 'express';
import * as dao from '../db/dao.js';
import { notifyAgentApproved, notifyAgentRejected } from '../ws/handler.js';
import type { AgentStatus } from '@agent-nexus/protocol';

export const agentsRouter: IRouter = Router();

// GET /api/agents
agentsRouter.get('/', async (req, res) => {
  const status = req.query.status as AgentStatus | undefined;
  const agents = await dao.listAgents(status ? { status } : undefined);
  res.json(agents);
});

// GET /api/agents/:id
agentsRouter.get('/:id', async (req, res) => {
  const agent = await dao.getAgentById(req.params.id);
  if (!agent) { res.status(404).json({ error: 'Not found' }); return; }
  const status = await dao.getAgentStatus(req.params.id);
  res.json({ ...agent, online_status: status });
});

// POST /api/agents/:id/approve
agentsRouter.post('/:id/approve', async (req, res) => {
  const agent = await dao.getAgentById(req.params.id);
  if (!agent) { res.status(404).json({ error: 'Not found' }); return; }
  if (agent.status !== 'pending_approval') {
    res.status(400).json({ error: `Agent status is ${agent.status}, not pending_approval` });
    return;
  }
  const updated = await dao.updateAgentStatus(req.params.id, 'active');
  await notifyAgentApproved(req.params.id);
  res.json(updated);
});

// POST /api/agents/:id/reject
agentsRouter.post('/:id/reject', async (req, res) => {
  const agent = await dao.getAgentById(req.params.id);
  if (!agent) { res.status(404).json({ error: 'Not found' }); return; }
  const updated = await dao.updateAgentStatus(req.params.id, 'rejected');
  await notifyAgentRejected(req.params.id, req.body.reason ?? 'Rejected by admin');
  res.json(updated);
});

// PATCH /api/agents/:id
agentsRouter.patch('/:id', async (req, res) => {
  const { name, role } = req.body;
  const updated = await dao.updateAgent(req.params.id, { name, role });
  res.json(updated);
});

// DELETE /api/agents/:id
agentsRouter.delete('/:id', async (req, res) => {
  await dao.updateAgentStatus(req.params.id, 'revoked');
  await dao.deleteAgent(req.params.id);
  res.json({ ok: true });
});
