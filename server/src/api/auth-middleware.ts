import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'agent-nexus-dev-secret';
const MASTER_TOKEN = process.env.MASTER_TOKEN || '';

export interface JwtPayload {
  userId: string;
  email: string;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  // Master token: bypass JWT verification, grant full access
  if (MASTER_TOKEN && token === MASTER_TOKEN) {
    (req as any).user = { userId: 'master', email: 'master@agent-nexus' } satisfies JwtPayload;
    next();
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    (req as any).user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}
