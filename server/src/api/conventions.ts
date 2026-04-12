import { Router, type IRouter } from 'express';
import { readConventionDir, getConventionsForRole } from '../conventions/reader.js';
import { ROLES } from '@agent-nexus/protocol';

export const conventionsRouter: IRouter = Router();

// GET /api/conventions
conventionsRouter.get('/', async (_req, res) => {
  const result: Record<string, unknown> = {};
  result.global = await readConventionDir('global');
  for (const role of ROLES) {
    result[role] = await readConventionDir(role);
  }
  res.json(result);
});

// GET /api/conventions/:role
conventionsRouter.get('/:role', async (req, res) => {
  const role = req.params.role;
  if (!ROLES.includes(role as any)) {
    res.status(400).json({ error: `Invalid role: ${role}` });
    return;
  }
  const conventions = await getConventionsForRole(role);
  res.json(conventions);
});
