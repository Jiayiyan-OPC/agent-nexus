import { Router } from 'express';
import { request as httpsRequest } from 'node:https';
import { supabase } from '../db/supabase.js';
import { signToken } from './auth-middleware.js';
import type { IRouter } from 'express';

export const authRouter: IRouter = Router();

const COGNITO_DOMAIN = process.env.COGNITO_DOMAIN!;
const COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID!;
const COGNITO_CLIENT_SECRET = process.env.COGNITO_CLIENT_SECRET!;
const COGNITO_REDIRECT_URI = process.env.COGNITO_REDIRECT_URI || 'http://localhost:9000/api/auth/callback';
const WEB_URL = process.env.WEB_URL || 'http://localhost:3000';

// Helper: https POST/GET that forces IPv4 (undici/fetch has IPv6 issues on some hosts)
function httpsPost(url: string, body: string, headers: Record<string, string>): Promise<any> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = httpsRequest({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      family: 4,
      headers: { ...headers, 'Content-Length': Buffer.byteLength(body).toString() },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function httpsGet(url: string, headers: Record<string, string>): Promise<any> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = httpsRequest({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      family: 4,
      headers,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// GET /api/auth/login — redirect to Cognito Hosted UI
authRouter.get('/login', (_req, res) => {
  const params = new URLSearchParams({
    client_id: COGNITO_CLIENT_ID,
    response_type: 'code',
    scope: 'openid email profile',
    redirect_uri: COGNITO_REDIRECT_URI,
  });
  res.redirect(`https://${COGNITO_DOMAIN}/oauth2/authorize?${params}`);
});

// GET /api/auth/callback — exchange authorization code for tokens
authRouter.get('/callback', async (req, res) => {
  try {
    const code = req.query.code as string;
    if (!code) { res.status(400).json({ error: 'Missing code' }); return; }

    const basicAuth = Buffer.from(`${COGNITO_CLIENT_ID}:${COGNITO_CLIENT_SECRET}`).toString('base64');
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: COGNITO_REDIRECT_URI,
    }).toString();

    const tokens = await httpsPost(`https://${COGNITO_DOMAIN}/oauth2/token`, body, {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
    });

    if (!tokens.access_token) {
      console.error('[auth] Token exchange failed:', tokens);
      res.status(401).json({ error: 'Failed to exchange code' });
      return;
    }

    const profile = await httpsGet(`https://${COGNITO_DOMAIN}/oauth2/userInfo`, {
      Authorization: `Bearer ${tokens.access_token}`,
    });

    const jwt = await upsertAndSign(profile.sub, profile.email, profile.name ?? profile.email, profile.picture);
    res.redirect(`${WEB_URL}/auth/callback?token=${jwt}`);
  } catch (err) {
    console.error('[auth] Callback error:', err);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// GET /api/auth/logout — redirect to Cognito logout
authRouter.get('/logout', (_req, res) => {
  const params = new URLSearchParams({
    client_id: COGNITO_CLIENT_ID,
    logout_uri: `${WEB_URL}/login`,
  });
  res.redirect(`https://${COGNITO_DOMAIN}/logout?${params}`);
});

// GET /api/auth/me — get current user from JWT
authRouter.get('/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) { res.status(401).json({ error: 'Not authenticated' }); return; }

  const token = authHeader.slice(7);
  try {
    const { default: jwt } = await import('jsonwebtoken');
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'agent-nexus-dev-secret') as any;
    const { data: user } = await supabase
      .from('users')
      .select('id, provider, provider_id, email, name, avatar_url')
      .eq('id', payload.userId)
      .single();
    if (!user) { res.status(401).json({ error: 'User not found' }); return; }
    res.json(user);
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// --- Shared ---

async function upsertAndSign(
  cognitoSub: string,
  email: string | null,
  name: string | null,
  avatarUrl: string | null,
): Promise<string> {
  const { data: existing } = await supabase
    .from('users')
    .select('*')
    .eq('provider', 'cognito')
    .eq('provider_id', cognitoSub)
    .single();

  let userId: string;
  let userEmail: string;

  if (existing) {
    userId = existing.id;
    userEmail = existing.email ?? email ?? '';
    await supabase
      .from('users')
      .update({ email, name, avatar_url: avatarUrl, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
  } else {
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({ provider: 'cognito', provider_id: cognitoSub, email, name, avatar_url: avatarUrl })
      .select()
      .single();
    if (error) throw error;
    userId = newUser.id;
    userEmail = email ?? '';
  }

  return signToken({ userId, email: userEmail });
}
