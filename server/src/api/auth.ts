import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import { signToken } from './auth-middleware.js';
import type { IRouter } from 'express';

export const authRouter: IRouter = Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID!;
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET!;
const AUTH_CALLBACK_URL = process.env.AUTH_CALLBACK_URL || 'http://localhost:3000/api/auth/callback';
const WEB_URL = process.env.WEB_URL || 'http://localhost:5173';

// --- Google OAuth ---

// GET /api/auth/login/google — redirect to Google consent screen
authRouter.get('/login/google', (_req, res) => {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: `${AUTH_CALLBACK_URL}/google`,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// GET /api/auth/callback/google — exchange code for user info
authRouter.get('/callback/google', async (req, res) => {
  const code = req.query.code as string;
  if (!code) { res.status(400).json({ error: 'Missing code' }); return; }

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: `${AUTH_CALLBACK_URL}/google`,
      grant_type: 'authorization_code',
    }),
  });
  const tokens = await tokenRes.json() as any;
  if (!tokens.access_token) { res.status(401).json({ error: 'Failed to exchange code' }); return; }

  // Fetch user info
  const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const profile = await userRes.json() as any;

  const jwt = await upsertAndSign('google', profile.sub, profile.email, profile.name, profile.picture);
  res.redirect(`${WEB_URL}/auth/callback?token=${jwt}`);
});

// --- Microsoft OAuth ---

// GET /api/auth/login/microsoft — redirect to Microsoft consent screen
authRouter.get('/login/microsoft', (_req, res) => {
  const params = new URLSearchParams({
    client_id: MICROSOFT_CLIENT_ID,
    redirect_uri: `${AUTH_CALLBACK_URL}/microsoft`,
    response_type: 'code',
    scope: 'openid email profile User.Read',
    response_mode: 'query',
    prompt: 'select_account',
  });
  res.redirect(`https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`);
});

// GET /api/auth/callback/microsoft — exchange code for user info
authRouter.get('/callback/microsoft', async (req, res) => {
  const code = req.query.code as string;
  if (!code) { res.status(400).json({ error: 'Missing code' }); return; }

  const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: MICROSOFT_CLIENT_ID,
      client_secret: MICROSOFT_CLIENT_SECRET,
      redirect_uri: `${AUTH_CALLBACK_URL}/microsoft`,
      grant_type: 'authorization_code',
    }),
  });
  const tokens = await tokenRes.json() as any;
  if (!tokens.access_token) { res.status(401).json({ error: 'Failed to exchange code' }); return; }

  // Fetch user info from Microsoft Graph
  const userRes = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const profile = await userRes.json() as any;

  const jwt = await upsertAndSign('microsoft', profile.id, profile.mail || profile.userPrincipalName, profile.displayName, null);
  res.redirect(`${WEB_URL}/auth/callback?token=${jwt}`);
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
      .select('id, provider, email, name, avatar_url')
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
  provider: string,
  providerId: string,
  email: string | null,
  name: string | null,
  avatarUrl: string | null,
): Promise<string> {
  // Try to find existing user
  const { data: existing } = await supabase
    .from('users')
    .select('*')
    .eq('provider', provider)
    .eq('provider_id', providerId)
    .single();

  let userId: string;
  let userEmail: string;

  if (existing) {
    userId = existing.id;
    userEmail = existing.email ?? email ?? '';
    // Update profile info on each login
    await supabase
      .from('users')
      .update({ email, name, avatar_url: avatarUrl, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
  } else {
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({ provider, provider_id: providerId, email, name, avatar_url: avatarUrl })
      .select()
      .single();
    if (error) throw error;
    userId = newUser.id;
    userEmail = email ?? '';
  }

  return signToken({ userId, email: userEmail });
}
