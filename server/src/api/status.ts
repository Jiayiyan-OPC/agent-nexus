import { Router, type IRouter } from 'express';
import * as dao from '../db/dao.js';

export const statusRouter: IRouter = Router();

// GET /api/status
statusRouter.get('/', async (_req, res) => {
  const statuses = await dao.getAllAgentStatuses();
  res.json(statuses);
});

// GET /api/status/:agentId
statusRouter.get('/:agentId', async (req, res) => {
  const status = await dao.getAgentStatus(req.params.agentId);
  if (!status) { res.status(404).json({ error: 'Not found' }); return; }
  const sessions = await dao.getActiveSessionsByAgent(req.params.agentId);
  res.json({ ...status, active_session_details: sessions });
});

// GET /api/status/sessions/:agentId
statusRouter.get('/sessions/:agentId', async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 20;
  const offset = parseInt(req.query.offset as string) || 0;
  const sessions = await dao.getSessionsByAgent(req.params.agentId, { limit, offset });
  res.json(sessions);
});
