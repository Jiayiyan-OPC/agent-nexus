# Agent Nexus Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Agent Nexus server (WebSocket + REST API + Supabase) and web UI (Vite + React + shadcn/ui) as a pnpm monorepo.

**Architecture:** pnpm workspace monorepo with three packages: `protocol/typescript` (shared types), `server` (Express + ws + Supabase DAO), and `web` (Vite React SPA). The server is the sole agent communication entry point via WebSocket; it writes state to Supabase. The web UI reads from Supabase directly (with Realtime subscriptions) and calls server REST API for admin actions. Plugins are out of scope for this plan.

**Tech Stack:** Node.js, TypeScript, pnpm workspaces, Express, ws, @supabase/supabase-js, Vite, React 19, React Router, shadcn/ui, Tailwind CSS 4

---

## Task 1: Monorepo Scaffolding

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `package.json` (root)
- Create: `tsconfig.base.json`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `protocol/typescript/package.json`
- Create: `protocol/typescript/tsconfig.json`
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `web/package.json` (via `pnpm create vite`)
- Create: `web/tsconfig.json` (via vite scaffold)

- [ ] **Step 1: Create root workspace files**

`pnpm-workspace.yaml`:
```yaml
packages:
  - protocol/typescript
  - server
  - web
```

`package.json`:
```json
{
  "name": "agent-nexus",
  "private": true,
  "scripts": {
    "dev:server": "pnpm --filter @agent-nexus/server dev",
    "dev:web": "pnpm --filter @agent-nexus/web dev",
    "dev": "pnpm run --parallel dev:server dev:web",
    "build": "pnpm -r build",
    "lint": "pnpm -r lint"
  },
  "devDependencies": {
    "typescript": "^5.8.0"
  }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

`.env.example`:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key
PORT=3000
```

`.gitignore`:
```
node_modules/
dist/
.env
*.tsbuildinfo
```

- [ ] **Step 2: Create protocol package**

`protocol/typescript/package.json`:
```json
{
  "name": "@agent-nexus/protocol",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "devDependencies": {
    "typescript": "^5.8.0"
  }
}
```

`protocol/typescript/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create server package**

`server/package.json`:
```json
{
  "name": "@agent-nexus/server",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@agent-nexus/protocol": "workspace:*",
    "@supabase/supabase-js": "^2.49.0",
    "chokidar": "^4.0.0",
    "cors": "^2.8.5",
    "dotenv": "^16.5.0",
    "express": "^5.1.0",
    "uuid": "^11.1.0",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^5.0.0",
    "@types/uuid": "^10.0.0",
    "@types/ws": "^8.18.0",
    "tsx": "^4.19.0",
    "typescript": "^5.8.0",
    "vitest": "^3.1.0"
  }
}
```

`server/tsconfig.json`:
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "references": [
    { "path": "../protocol/typescript" }
  ]
}
```

- [ ] **Step 4: Scaffold web package with Vite**

Run:
```bash
cd /Users/yanjiayi/workspace/agent-nexus
pnpm create vite web --template react-ts
```

Then update `web/package.json` name to `@agent-nexus/web` and add dependency:
```json
"dependencies": {
  "@agent-nexus/protocol": "workspace:*",
  "@supabase/supabase-js": "^2.49.0"
}
```

- [ ] **Step 5: Install all dependencies**

Run:
```bash
cd /Users/yanjiayi/workspace/agent-nexus
pnpm install
```

- [ ] **Step 6: Verify workspace setup**

Run:
```bash
pnpm -r list --depth 0
```
Expected: three packages listed (`@agent-nexus/protocol`, `@agent-nexus/server`, `@agent-nexus/web`)

- [ ] **Step 7: Commit**

```bash
git add pnpm-workspace.yaml package.json tsconfig.base.json .env.example .gitignore protocol/ server/package.json server/tsconfig.json web/ pnpm-lock.yaml
git commit -m "chore: scaffold pnpm monorepo with protocol, server, and web packages"
```

---

## Task 2: Protocol Types

**Files:**
- Create: `protocol/typescript/src/index.ts`
- Create: `protocol/typescript/src/enums.ts`
- Create: `protocol/typescript/src/messages.ts`
- Create: `protocol/typescript/src/tables.ts`

- [ ] **Step 1: Create enums**

`protocol/typescript/src/enums.ts`:
```typescript
export const ROLES = ['arch', 'pmo', 'dev', 'qa', 'devops'] as const;
export type Role = typeof ROLES[number];

export const AGENT_TYPES = ['hermes', 'openclaw'] as const;
export type AgentType = typeof AGENT_TYPES[number];

export const AGENT_STATUSES = ['pending_approval', 'active', 'rejected', 'revoked'] as const;
export type AgentStatus = typeof AGENT_STATUSES[number];

export const ONLINE_STATUSES = ['online', 'offline', 'error'] as const;
export type OnlineStatus = typeof ONLINE_STATUSES[number];

export const SESSION_STATUSES = ['active', 'completed', 'error'] as const;
export type SessionStatus = typeof SESSION_STATUSES[number];
```

- [ ] **Step 2: Create table row types**

`protocol/typescript/src/tables.ts`:
```typescript
import type { AgentType, Role, AgentStatus, OnlineStatus, SessionStatus } from './enums.js';

export interface AgentRow {
  id: string;
  api_key: string;
  name: string;
  agent_type: AgentType;
  role: Role;
  status: AgentStatus;
  mac_address: string | null;
  hostname: string | null;
  os: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface AgentStatusRow {
  agent_id: string;
  status: OnlineStatus;
  active_sessions: number;
  total_token_used: number;
  session_start: string | null;
  last_heartbeat: string | null;
  error_message: string | null;
  updated_at: string;
}

export interface AgentSessionRow {
  id: string;
  agent_id: string;
  task_name: string | null;
  status: SessionStatus;
  token_used: number;
  token_limit: number | null;
  started_at: string;
  ended_at: string | null;
  metadata: Record<string, unknown> | null;
}
```

- [ ] **Step 3: Create message types**

`protocol/typescript/src/messages.ts`:
```typescript
import type { AgentType, Role, SessionStatus } from './enums.js';

// Base message envelope
export interface WsMessage<T extends string = string, P = unknown> {
  type: T;
  payload: P;
  ts: string;
}

// --- Agent -> Server ---

export type RegisterPayload = {
  name: string;
  agentType: AgentType;
  role: Role;
  hostname?: string;
  mac?: string;
  os?: string;
};

export type AuthPayload = {
  apiKey: string;
  hostname?: string;
  mac?: string;
  os?: string;
};

export type SessionStartPayload = {
  sessionId: string;
  taskName?: string;
  tokenLimit?: number;
};

export type SessionUpdatePayload = {
  sessionId: string;
  tokenUsed?: number;
  taskName?: string;
};

export type SessionEndPayload = {
  sessionId: string;
  status: SessionStatus;
  tokenUsed?: number;
};

export type AgentToServer =
  | WsMessage<'register', RegisterPayload>
  | WsMessage<'auth', AuthPayload>
  | WsMessage<'session.start', SessionStartPayload>
  | WsMessage<'session.update', SessionUpdatePayload>
  | WsMessage<'session.end', SessionEndPayload>
  | WsMessage<'heartbeat', Record<string, never>>;

// --- Server -> Agent ---

export type ConventionFiles = { filename: string; content: string }[];

export type AuthOkPayload = {
  agentId: string;
  name: string;
  role: Role;
  conventions: { global: ConventionFiles; role: ConventionFiles };
};

export type AuthFailPayload = { reason: string };

export type RegisterPendingPayload = { agentId: string; message: string };

export type RegisterApprovedPayload = {
  apiKey: string;
  agentId: string;
  name: string;
  role: Role;
  conventions: { global: ConventionFiles; role: ConventionFiles };
};

export type RegisterRejectedPayload = { reason: string };

export type ConventionsUpdatePayload = {
  scope: 'global' | 'role';
  files: ConventionFiles;
};

export type ErrorPayload = { reason: string };

export type ServerToAgent =
  | WsMessage<'auth.ok', AuthOkPayload>
  | WsMessage<'auth.fail', AuthFailPayload>
  | WsMessage<'register.pending', RegisterPendingPayload>
  | WsMessage<'register.approved', RegisterApprovedPayload>
  | WsMessage<'register.rejected', RegisterRejectedPayload>
  | WsMessage<'conventions.update', ConventionsUpdatePayload>
  | WsMessage<'heartbeat.ack', Record<string, never>>
  | WsMessage<'error', ErrorPayload>;
```

- [ ] **Step 4: Create barrel export**

`protocol/typescript/src/index.ts`:
```typescript
export * from './enums.js';
export * from './tables.js';
export * from './messages.js';
```

- [ ] **Step 5: Build and verify**

Run:
```bash
cd /Users/yanjiayi/workspace/agent-nexus
pnpm --filter @agent-nexus/protocol build
```
Expected: `protocol/typescript/dist/` created with `.js` and `.d.ts` files, no errors.

- [ ] **Step 6: Commit**

```bash
git add protocol/typescript/src/
git commit -m "feat: add shared protocol types (enums, table rows, WS messages)"
```

---

## Task 3: Supabase Migration

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`

- [ ] **Step 1: Write migration SQL**

`supabase/migrations/001_initial_schema.sql`:
```sql
-- Agents table
CREATE TABLE agents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key       TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  agent_type    TEXT NOT NULL CHECK (agent_type IN ('hermes', 'openclaw')),
  role          TEXT NOT NULL CHECK (role IN ('arch', 'pmo', 'dev', 'qa', 'devops')),
  status        TEXT NOT NULL DEFAULT 'pending_approval'
                CHECK (status IN ('pending_approval', 'active', 'rejected', 'revoked')),
  mac_address   TEXT,
  hostname      TEXT,
  os            TEXT,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Agent status (aggregated view)
CREATE TABLE agent_status (
  agent_id          UUID PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'offline'
                    CHECK (status IN ('online', 'offline', 'error')),
  active_sessions   INTEGER NOT NULL DEFAULT 0,
  total_token_used  INTEGER NOT NULL DEFAULT 0,
  session_start     TIMESTAMPTZ,
  last_heartbeat    TIMESTAMPTZ,
  error_message     TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Agent sessions
CREATE TABLE agent_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  task_name     TEXT,
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'completed', 'error')),
  token_used    INTEGER NOT NULL DEFAULT 0,
  token_limit   INTEGER,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at      TIMESTAMPTZ,
  metadata      JSONB
);

CREATE INDEX idx_agent_sessions_agent_id ON agent_sessions(agent_id);
CREATE INDEX idx_agent_sessions_status ON agent_sessions(status);

-- Auto-create agent_status row when agent is inserted
CREATE OR REPLACE FUNCTION create_agent_status()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO agent_status (agent_id, updated_at) VALUES (NEW.id, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_create_agent_status
  AFTER INSERT ON agents
  FOR EACH ROW EXECUTE FUNCTION create_agent_status();

-- Auto-update updated_at on agents
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_agents_updated_at
  BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_agent_status_updated_at
  BEFORE UPDATE ON agent_status
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS: enable on all tables
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;

-- RLS policies: authenticated users (admin) get full access
CREATE POLICY "Authenticated users have full access to agents"
  ON agents FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users have full access to agent_status"
  ON agent_status FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users have full access to agent_sessions"
  ON agent_sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Enable Realtime on status tables
ALTER PUBLICATION supabase_realtime ADD TABLE agents;
ALTER PUBLICATION supabase_realtime ADD TABLE agent_status;
ALTER PUBLICATION supabase_realtime ADD TABLE agent_sessions;
```

- [ ] **Step 2: Apply migration**

Apply via Supabase Dashboard SQL Editor or `supabase db push` (if using Supabase CLI). Verify tables exist:

Run in Supabase SQL Editor:
```sql
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
```
Expected: `agents`, `agent_status`, `agent_sessions` all present.

- [ ] **Step 3: Commit**

```bash
git add supabase/
git commit -m "feat: add Supabase migration (agents, agent_status, agent_sessions + RLS + Realtime)"
```

---

## Task 4: Server - Supabase Client & DAO

**Files:**
- Create: `server/src/db/supabase.ts`
- Create: `server/src/db/dao.ts`
- Create: `server/src/db/dao.test.ts`

- [ ] **Step 1: Create Supabase client**

`server/src/db/supabase.ts`:
```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
```

- [ ] **Step 2: Write DAO tests**

`server/src/db/dao.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createAgent, getAgentByApiKey, getAgentById, listAgents, updateAgentStatus as updateAgentApprovalStatus, deleteAgent } from './dao.js';
import { supabase } from './supabase.js';

// These are integration tests that require a running Supabase instance.
// Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env before running.

const TEST_PREFIX = 'dao-test-';
let testAgentId: string;
let testApiKey: string;

describe('DAO', () => {
  afterAll(async () => {
    // Cleanup: delete test agents
    const { data } = await supabase
      .from('agents')
      .select('id')
      .like('name', `${TEST_PREFIX}%`);
    if (data) {
      for (const row of data) {
        await supabase.from('agent_sessions').delete().eq('agent_id', row.id);
        await supabase.from('agent_status').delete().eq('agent_id', row.id);
        await supabase.from('agents').delete().eq('id', row.id);
      }
    }
  });

  it('createAgent inserts agent and auto-creates agent_status', async () => {
    const agent = await createAgent({
      name: `${TEST_PREFIX}alpha`,
      agentType: 'hermes',
      role: 'dev',
    });
    testAgentId = agent.id;
    testApiKey = agent.api_key;

    expect(agent.name).toBe(`${TEST_PREFIX}alpha`);
    expect(agent.status).toBe('pending_approval');

    // Verify agent_status was auto-created by trigger
    const { data: statusRow } = await supabase
      .from('agent_status')
      .select('*')
      .eq('agent_id', agent.id)
      .single();
    expect(statusRow).not.toBeNull();
    expect(statusRow!.status).toBe('offline');
  });

  it('getAgentByApiKey returns the agent', async () => {
    const agent = await getAgentByApiKey(testApiKey);
    expect(agent).not.toBeNull();
    expect(agent!.id).toBe(testAgentId);
  });

  it('getAgentById returns the agent', async () => {
    const agent = await getAgentById(testAgentId);
    expect(agent).not.toBeNull();
    expect(agent!.name).toBe(`${TEST_PREFIX}alpha`);
  });

  it('listAgents with status filter returns matching agents', async () => {
    const agents = await listAgents({ status: 'pending_approval' });
    expect(agents.some(a => a.id === testAgentId)).toBe(true);
  });

  it('updateAgentApprovalStatus changes status to active', async () => {
    const agent = await updateAgentApprovalStatus(testAgentId, 'active');
    expect(agent.status).toBe('active');
  });

  it('deleteAgent removes the agent', async () => {
    // Create a throwaway agent to delete
    const temp = await createAgent({
      name: `${TEST_PREFIX}to-delete`,
      agentType: 'openclaw',
      role: 'qa',
    });
    await deleteAgent(temp.id);
    const found = await getAgentById(temp.id);
    expect(found).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:
```bash
cd /Users/yanjiayi/workspace/agent-nexus
pnpm --filter @agent-nexus/server exec vitest run src/db/dao.test.ts
```
Expected: FAIL — `dao.ts` doesn't exist yet.

- [ ] **Step 4: Implement DAO**

`server/src/db/dao.ts`:
```typescript
import { v4 as uuidv4 } from 'uuid';
import { supabase } from './supabase.js';
import type { AgentRow, AgentStatusRow, AgentSessionRow, AgentStatus, OnlineStatus, SessionStatus } from '@agent-nexus/protocol';

// --- Agents ---

export async function createAgent(input: {
  name: string;
  agentType: string;
  role: string;
  hostname?: string;
  mac?: string;
  os?: string;
}): Promise<AgentRow> {
  const apiKey = `nexus_${uuidv4().replace(/-/g, '')}`;
  const { data, error } = await supabase
    .from('agents')
    .insert({
      api_key: apiKey,
      name: input.name,
      agent_type: input.agentType,
      role: input.role,
      hostname: input.hostname ?? null,
      mac_address: input.mac ?? null,
      os: input.os ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as AgentRow;
}

export async function getAgentByApiKey(apiKey: string): Promise<AgentRow | null> {
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .eq('api_key', apiKey)
    .single();
  if (error && error.code === 'PGRST116') return null; // not found
  if (error) throw error;
  return data as AgentRow;
}

export async function getAgentById(id: string): Promise<AgentRow | null> {
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .eq('id', id)
    .single();
  if (error && error.code === 'PGRST116') return null;
  if (error) throw error;
  return data as AgentRow;
}

export async function findPendingAgent(name: string, agentType: string, role: string): Promise<AgentRow | null> {
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .eq('name', name)
    .eq('agent_type', agentType)
    .eq('role', role)
    .eq('status', 'pending_approval')
    .single();
  if (error && error.code === 'PGRST116') return null;
  if (error) throw error;
  return data as AgentRow;
}

export async function listAgents(filter?: { status?: AgentStatus }): Promise<AgentRow[]> {
  let query = supabase.from('agents').select('*');
  if (filter?.status) {
    query = query.eq('status', filter.status);
  }
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as AgentRow[];
}

export async function updateAgentStatus(id: string, status: AgentStatus): Promise<AgentRow> {
  const { data, error } = await supabase
    .from('agents')
    .update({ status })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as AgentRow;
}

export async function updateAgent(id: string, fields: { name?: string; role?: string }): Promise<AgentRow> {
  const { data, error } = await supabase
    .from('agents')
    .update(fields)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as AgentRow;
}

export async function deleteAgent(id: string): Promise<void> {
  const { error } = await supabase.from('agents').delete().eq('id', id);
  if (error) throw error;
}

// --- Agent Status ---

export async function setAgentOnline(agentId: string): Promise<void> {
  const { error } = await supabase
    .from('agent_status')
    .update({ status: 'online' as OnlineStatus, session_start: new Date().toISOString(), last_heartbeat: new Date().toISOString() })
    .eq('agent_id', agentId);
  if (error) throw error;
}

export async function setAgentOffline(agentId: string): Promise<void> {
  const { error } = await supabase
    .from('agent_status')
    .update({ status: 'offline' as OnlineStatus, active_sessions: 0 })
    .eq('agent_id', agentId);
  if (error) throw error;
}

export async function updateHeartbeat(agentId: string): Promise<void> {
  const { error } = await supabase
    .from('agent_status')
    .update({ last_heartbeat: new Date().toISOString() })
    .eq('agent_id', agentId);
  if (error) throw error;
}

export async function getAgentStatus(agentId: string): Promise<AgentStatusRow | null> {
  const { data, error } = await supabase
    .from('agent_status')
    .select('*')
    .eq('agent_id', agentId)
    .single();
  if (error && error.code === 'PGRST116') return null;
  if (error) throw error;
  return data as AgentStatusRow;
}

export async function getAllAgentStatuses(): Promise<AgentStatusRow[]> {
  const { data, error } = await supabase.from('agent_status').select('*');
  if (error) throw error;
  return (data ?? []) as AgentStatusRow[];
}

// --- Sessions ---

export async function createSession(input: {
  id: string;
  agentId: string;
  taskName?: string;
  tokenLimit?: number;
}): Promise<AgentSessionRow> {
  const { data, error } = await supabase
    .from('agent_sessions')
    .insert({
      id: input.id,
      agent_id: input.agentId,
      task_name: input.taskName ?? null,
      token_limit: input.tokenLimit ?? null,
    })
    .select()
    .single();
  if (error) throw error;

  // Increment active_sessions count
  await supabase.rpc('increment_active_sessions', { p_agent_id: input.agentId });

  return data as AgentSessionRow;
}

export async function updateSession(sessionId: string, fields: {
  tokenUsed?: number;
  taskName?: string;
}): Promise<void> {
  const update: Record<string, unknown> = {};
  if (fields.tokenUsed !== undefined) update.token_used = fields.tokenUsed;
  if (fields.taskName !== undefined) update.task_name = fields.taskName;
  const { error } = await supabase
    .from('agent_sessions')
    .update(update)
    .eq('id', sessionId);
  if (error) throw error;
}

export async function endSession(sessionId: string, status: SessionStatus, tokenUsed?: number): Promise<void> {
  const update: Record<string, unknown> = {
    status,
    ended_at: new Date().toISOString(),
  };
  if (tokenUsed !== undefined) update.token_used = tokenUsed;

  const { data, error } = await supabase
    .from('agent_sessions')
    .update(update)
    .eq('id', sessionId)
    .select('agent_id')
    .single();
  if (error) throw error;

  // Decrement active_sessions and add to total
  if (data) {
    await supabase.rpc('decrement_active_sessions', { p_agent_id: data.agent_id, p_token_used: tokenUsed ?? 0 });
  }
}

export async function getSessionsByAgent(agentId: string, options?: { limit?: number; offset?: number }): Promise<AgentSessionRow[]> {
  let query = supabase
    .from('agent_sessions')
    .select('*')
    .eq('agent_id', agentId)
    .order('started_at', { ascending: false });
  if (options?.limit) query = query.limit(options.limit);
  if (options?.offset) query = query.range(options.offset, options.offset + (options?.limit ?? 20) - 1);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as AgentSessionRow[];
}

export async function getActiveSessionsByAgent(agentId: string): Promise<AgentSessionRow[]> {
  const { data, error } = await supabase
    .from('agent_sessions')
    .select('*')
    .eq('agent_id', agentId)
    .eq('status', 'active')
    .order('started_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as AgentSessionRow[];
}
```

Note: `createSession` and `endSession` use Supabase RPC functions to atomically increment/decrement counters. Add these to the migration:

Append to `supabase/migrations/001_initial_schema.sql`:
```sql
-- RPC: increment active_sessions
CREATE OR REPLACE FUNCTION increment_active_sessions(p_agent_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE agent_status
  SET active_sessions = active_sessions + 1
  WHERE agent_id = p_agent_id;
END;
$$ LANGUAGE plpgsql;

-- RPC: decrement active_sessions and add token usage
CREATE OR REPLACE FUNCTION decrement_active_sessions(p_agent_id UUID, p_token_used INTEGER)
RETURNS void AS $$
BEGIN
  UPDATE agent_status
  SET active_sessions = GREATEST(active_sessions - 1, 0),
      total_token_used = total_token_used + p_token_used
  WHERE agent_id = p_agent_id;
END;
$$ LANGUAGE plpgsql;
```

- [ ] **Step 5: Add vitest config**

Create `server/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['dotenv/config'],
  },
});
```

Add to `server/package.json` scripts:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 6: Run tests to verify they pass**

Run:
```bash
pnpm --filter @agent-nexus/server test
```
Expected: all 6 tests pass.

- [ ] **Step 7: Commit**

```bash
git add server/src/db/ server/vitest.config.ts supabase/
git commit -m "feat: add Supabase DAO with agent, status, and session operations"
```

---

## Task 5: Server - Convention Watcher

**Files:**
- Create: `server/src/conventions/watcher.ts`
- Create: `server/src/conventions/reader.ts`

- [ ] **Step 1: Create convention reader**

`server/src/conventions/reader.ts`:
```typescript
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ConventionFiles } from '@agent-nexus/protocol';

const CONVENTIONS_DIR = join(import.meta.dirname, '../../conventions');

export function getConventionsDir(): string {
  return CONVENTIONS_DIR;
}

export async function readConventionDir(subdir: string): Promise<ConventionFiles> {
  const dir = join(CONVENTIONS_DIR, subdir);
  try {
    const files = await readdir(dir);
    const results: ConventionFiles = [];
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const content = await readFile(join(dir, file), 'utf-8');
      results.push({ filename: file, content });
    }
    return results;
  } catch {
    return [];
  }
}

export async function getConventionsForRole(role: string): Promise<{ global: ConventionFiles; role: ConventionFiles }> {
  const [global, roleFiles] = await Promise.all([
    readConventionDir('global'),
    readConventionDir(role),
  ]);
  return { global, role: roleFiles };
}
```

- [ ] **Step 2: Create convention watcher**

`server/src/conventions/watcher.ts`:
```typescript
import { watch } from 'chokidar';
import { readFile } from 'node:fs/promises';
import { relative, sep } from 'node:path';
import { getConventionsDir, readConventionDir } from './reader.js';
import type { ConventionFiles } from '@agent-nexus/protocol';

export type ConventionChangeHandler = (event: {
  scope: 'global' | 'role';
  role?: string;
  files: ConventionFiles;
}) => void;

export function watchConventions(onChange: ConventionChangeHandler): void {
  const dir = getConventionsDir();

  const watcher = watch(dir, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 300 },
  });

  const handleChange = async (filePath: string) => {
    const rel = relative(dir, filePath);
    const parts = rel.split(sep);
    if (parts.length < 2) return;

    const subdir = parts[0];
    if (!filePath.endsWith('.md')) return;

    if (subdir === 'global') {
      const files = await readConventionDir('global');
      onChange({ scope: 'global', files });
    } else {
      const files = await readConventionDir(subdir);
      onChange({ scope: 'role', role: subdir, files });
    }
  };

  watcher.on('add', handleChange);
  watcher.on('change', handleChange);
  watcher.on('unlink', handleChange);
}
```

- [ ] **Step 3: Create convention directories with placeholder files**

```bash
mkdir -p server/conventions/{global,arch,pmo,dev,qa,devops}
echo "# Code Style" > server/conventions/global/code-style.md
echo "# Commit Rules" > server/conventions/global/commit-rules.md
```

- [ ] **Step 4: Commit**

```bash
git add server/src/conventions/ server/conventions/
git commit -m "feat: add convention file reader and chokidar watcher"
```

---

## Task 6: Server - WebSocket Handler

**Files:**
- Create: `server/src/ws/state.ts`
- Create: `server/src/ws/send.ts`
- Create: `server/src/ws/handler.ts`
- Create: `server/src/ws/heartbeat.ts`

- [ ] **Step 1: Create connection state manager**

`server/src/ws/state.ts`:
```typescript
import type { WebSocket } from 'ws';

export interface ConnectedAgent {
  ws: WebSocket;
  agentId: string;
  role: string;
  state: 'unauthenticated' | 'pending_approval' | 'active';
  lastHeartbeat: number;
}

// agentId -> ConnectedAgent
const agents = new Map<string, ConnectedAgent>();
// ws -> ConnectedAgent (reverse lookup)
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
```

- [ ] **Step 2: Create send helper**

`server/src/ws/send.ts`:
```typescript
import type { WebSocket } from 'ws';
import type { ServerToAgent } from '@agent-nexus/protocol';

export function send(ws: WebSocket, message: ServerToAgent): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({ ...message, ts: new Date().toISOString() }));
  }
}
```

- [ ] **Step 3: Create heartbeat monitor**

`server/src/ws/heartbeat.ts`:
```typescript
import { getAllActiveConnections, getConnectionByAgentId, removeConnection } from './state.js';
import * as dao from '../db/dao.js';

const OFFLINE_THRESHOLD_MS = 90_000;

let intervalId: ReturnType<typeof setInterval> | null = null;

export function startHeartbeatMonitor(): void {
  intervalId = setInterval(async () => {
    const now = Date.now();
    for (const conn of getAllActiveConnections()) {
      if (now - conn.lastHeartbeat > OFFLINE_THRESHOLD_MS) {
        console.log(`Agent ${conn.agentId} heartbeat timeout, disconnecting`);
        conn.ws.close();
        removeConnection(conn.ws);
        await dao.setAgentOffline(conn.agentId);
      }
    }
  }, 30_000);
}

export function stopHeartbeatMonitor(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
```

- [ ] **Step 4: Create main WebSocket handler**

`server/src/ws/handler.ts`:
```typescript
import type { WebSocket } from 'ws';
import type { AgentToServer } from '@agent-nexus/protocol';
import { send } from './send.js';
import { addConnection, removeConnection, getConnectionBySocket } from './state.js';
import { getConventionsForRole } from '../conventions/reader.js';
import * as dao from '../db/dao.js';

const AUTH_TIMEOUT_MS = 5_000;

export function handleConnection(ws: WebSocket): void {
  let authenticated = false;

  // Auth timeout: disconnect if no auth/register within 5s
  const authTimer = setTimeout(() => {
    if (!authenticated) {
      send(ws, { type: 'error', payload: { reason: 'Auth timeout' }, ts: '' });
      ws.close();
    }
  }, AUTH_TIMEOUT_MS);

  ws.on('message', async (raw: Buffer) => {
    let msg: AgentToServer;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      send(ws, { type: 'error', payload: { reason: 'Invalid JSON' }, ts: '' });
      return;
    }

    const conn = getConnectionBySocket(ws);

    // Unauthenticated: only register and auth allowed
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

    // Pending: only heartbeat allowed
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
  });

  ws.on('close', async () => {
    clearTimeout(authTimer);
    const conn = removeConnection(ws);
    if (conn && conn.state === 'active') {
      await dao.setAgentOffline(conn.agentId);
    }
  });
}

async function handleRegister(ws: WebSocket, payload: AgentToServer extends { type: 'register'; payload: infer P } ? P : never): Promise<void> {
  // Check for duplicate pending registration
  const existing = await dao.findPendingAgent(payload.name, payload.agentType, payload.role);
  if (existing) {
    addConnection(ws, { agentId: existing.id, role: existing.role, state: 'pending_approval' });
    send(ws, {
      type: 'register.pending',
      payload: { agentId: existing.id, message: 'Awaiting admin approval (reconnected to existing registration)' },
      ts: '',
    });
    return;
  }

  const agent = await dao.createAgent({
    name: payload.name,
    agentType: payload.agentType,
    role: payload.role,
    hostname: payload.hostname,
    mac: payload.mac,
    os: payload.os,
  });

  addConnection(ws, { agentId: agent.id, role: agent.role, state: 'pending_approval' });
  send(ws, {
    type: 'register.pending',
    payload: { agentId: agent.id, message: 'Awaiting admin approval' },
    ts: '',
  });
}

async function handleAuth(ws: WebSocket, payload: AgentToServer extends { type: 'auth'; payload: infer P } ? P : never): Promise<boolean> {
  const agent = await dao.getAgentByApiKey(payload.apiKey);
  if (!agent || agent.status !== 'active') {
    send(ws, { type: 'auth.fail', payload: { reason: agent ? 'Agent not active' : 'Invalid API key' }, ts: '' });
    ws.close();
    return false;
  }

  // Update device info if provided
  if (payload.hostname || payload.mac || payload.os) {
    await dao.updateAgent(agent.id, {});
    // Update hostname/mac/os directly
    const { error } = await (await import('../db/supabase.js')).supabase
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

  const conventions = await getConventionsForRole(agent.role);
  send(ws, {
    type: 'auth.ok',
    payload: {
      agentId: agent.id,
      name: agent.name,
      role: agent.role,
      conventions,
    },
    ts: '',
  });
  return true;
}

// Called by REST API when admin approves an agent
export async function notifyAgentApproved(agentId: string): Promise<void> {
  const conn = getConnectionBySocket ? undefined : undefined; // need by agentId
  const { getConnectionByAgentId } = await import('./state.js');
  const agentConn = getConnectionByAgentId(agentId);
  if (!agentConn) return; // agent not connected

  const agent = await dao.getAgentById(agentId);
  if (!agent) return;

  agentConn.state = 'active';
  await dao.setAgentOnline(agentId);

  const conventions = await getConventionsForRole(agent.role);
  send(agentConn.ws, {
    type: 'register.approved',
    payload: {
      apiKey: agent.api_key,
      agentId: agent.id,
      name: agent.name,
      role: agent.role,
      conventions,
    },
    ts: '',
  });
}

export async function notifyAgentRejected(agentId: string, reason: string): Promise<void> {
  const { getConnectionByAgentId } = await import('./state.js');
  const agentConn = getConnectionByAgentId(agentId);
  if (!agentConn) return;

  send(agentConn.ws, {
    type: 'register.rejected',
    payload: { reason },
    ts: '',
  });
  agentConn.ws.close();
}
```

- [ ] **Step 5: Commit**

```bash
git add server/src/ws/
git commit -m "feat: add WebSocket handler with auth, register, session, and heartbeat"
```

---

## Task 7: Server - REST API & Entry Point

**Files:**
- Create: `server/src/api/agents.ts`
- Create: `server/src/api/status.ts`
- Create: `server/src/api/conventions.ts`
- Create: `server/src/api/auth-middleware.ts`
- Create: `server/src/index.ts`

- [ ] **Step 1: Create auth middleware**

`server/src/api/auth-middleware.ts`:
```typescript
import type { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  (req as any).user = user;
  next();
}
```

- [ ] **Step 2: Create agents API**

`server/src/api/agents.ts`:
```typescript
import { Router } from 'express';
import * as dao from '../db/dao.js';
import { notifyAgentApproved, notifyAgentRejected } from '../ws/handler.js';
import type { AgentStatus } from '@agent-nexus/protocol';

export const agentsRouter = Router();

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
```

- [ ] **Step 3: Create status API**

`server/src/api/status.ts`:
```typescript
import { Router } from 'express';
import * as dao from '../db/dao.js';

export const statusRouter = Router();

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

// GET /api/sessions/:agentId
statusRouter.get('/sessions/:agentId', async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 20;
  const offset = parseInt(req.query.offset as string) || 0;
  const sessions = await dao.getSessionsByAgent(req.params.agentId, { limit, offset });
  res.json(sessions);
});
```

- [ ] **Step 4: Create conventions API**

`server/src/api/conventions.ts`:
```typescript
import { Router } from 'express';
import { readConventionDir, getConventionsForRole } from '../conventions/reader.js';
import { ROLES } from '@agent-nexus/protocol';

export const conventionsRouter = Router();

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
```

- [ ] **Step 5: Create server entry point**

`server/src/index.ts`:
```typescript
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

const app = express();
app.use(cors());
app.use(express.json());

// REST API — all admin endpoints require auth
app.use('/api/agents', requireAuth, agentsRouter);
app.use('/api/status', requireAuth, statusRouter);
app.use('/api/conventions', requireAuth, conventionsRouter);

// Health check
app.get('/health', (_req, res) => res.json({ ok: true }));

const server = createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', handleConnection);

// Start heartbeat monitor
startHeartbeatMonitor();

// Watch convention files and push to agents
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
```

- [ ] **Step 6: Verify server starts**

Run:
```bash
pnpm --filter @agent-nexus/protocol build && pnpm --filter @agent-nexus/server dev
```
Expected: `Agent Nexus server running on port 3000`. Hit `http://localhost:3000/health` and get `{"ok":true}`.

- [ ] **Step 7: Commit**

```bash
git add server/src/
git commit -m "feat: add REST API (agents, status, conventions) and server entry point"
```

---

## Task 8: Web - Vite + React + shadcn/ui Scaffolding

**Files:**
- Modify: `web/` (scaffold already created in Task 1 Step 4)
- Create: `web/src/lib/supabase.ts`
- Create: `web/src/lib/utils.ts`
- Modify: `web/src/App.tsx`
- Modify: `web/src/main.tsx`

- [ ] **Step 1: Initialize shadcn/ui and Tailwind**

Run:
```bash
cd /Users/yanjiayi/workspace/agent-nexus/web
pnpm add react-router
pnpm dlx shadcn@latest init
```

Select: TypeScript, Default style, CSS variables. This sets up Tailwind CSS, `cn()` util, and `components.json`.

Then add base components:
```bash
pnpm dlx shadcn@latest add button card badge table input label separator dropdown-menu dialog tabs
```

- [ ] **Step 2: Create Supabase client**

`web/src/lib/supabase.ts`:
```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

Add to `.env.example`:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_URL=http://localhost:3000
```

- [ ] **Step 3: Set up routing**

`web/src/App.tsx`:
```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { AuthProvider, useAuth } from './hooks/useAuth';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import PendingApproval from './pages/PendingApproval';
import AgentDetail from './pages/AgentDetail';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/pending" element={<ProtectedRoute><PendingApproval /></ProtectedRoute>} />
          <Route path="/agents/:id" element={<ProtectedRoute><AgentDetail /></ProtectedRoute>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
```

`web/src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 4: Commit**

```bash
git add web/
git commit -m "feat: scaffold web app with shadcn/ui, Supabase client, and routing"
```

---

## Task 9: Web - Auth Hook & Login Page

**Files:**
- Create: `web/src/hooks/useAuth.tsx`
- Create: `web/src/pages/Login.tsx`

- [ ] **Step 1: Create auth hook**

`web/src/hooks/useAuth.tsx`:
```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContext {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthCtx = createContext<AuthContext | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthCtx.Provider value={{ user, session, loading, signIn, signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth(): AuthContext {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

- [ ] **Step 2: Create Login page**

`web/src/pages/Login.tsx`:
```tsx
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      navigate('/');
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-center text-2xl">Agent Nexus</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Verify login page renders**

Run:
```bash
pnpm --filter @agent-nexus/web dev
```
Open `http://localhost:5173/login`. Expected: centered card with email/password form and "Agent Nexus" title.

- [ ] **Step 4: Commit**

```bash
git add web/src/hooks/useAuth.tsx web/src/pages/Login.tsx
git commit -m "feat: add auth hook and login page"
```

---

## Task 10: Web - API Client & Realtime Hook

**Files:**
- Create: `web/src/lib/api.ts`
- Create: `web/src/hooks/useAgents.ts`

- [ ] **Step 1: Create API client**

`web/src/lib/api.ts`:
```typescript
import { supabase } from './supabase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  return fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
}

export async function fetchAgents(status?: string) {
  const query = status ? `?status=${status}` : '';
  const res = await authFetch(`/api/agents${query}`);
  return res.json();
}

export async function fetchAgent(id: string) {
  const res = await authFetch(`/api/agents/${id}`);
  return res.json();
}

export async function approveAgent(id: string) {
  const res = await authFetch(`/api/agents/${id}/approve`, { method: 'POST' });
  return res.json();
}

export async function rejectAgent(id: string, reason?: string) {
  const res = await authFetch(`/api/agents/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
  return res.json();
}

export async function updateAgent(id: string, fields: { name?: string; role?: string }) {
  const res = await authFetch(`/api/agents/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(fields),
  });
  return res.json();
}

export async function revokeAgent(id: string) {
  const res = await authFetch(`/api/agents/${id}`, { method: 'DELETE' });
  return res.json();
}

export async function fetchSessions(agentId: string, limit = 20, offset = 0) {
  const res = await authFetch(`/api/status/sessions/${agentId}?limit=${limit}&offset=${offset}`);
  return res.json();
}
```

- [ ] **Step 2: Create realtime agents hook**

`web/src/hooks/useAgents.ts`:
```typescript
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { fetchAgents } from '../lib/api';
import type { AgentRow, AgentStatusRow, AgentSessionRow } from '@agent-nexus/protocol';

export interface AgentWithStatus extends AgentRow {
  online_status: AgentStatusRow | null;
}

export function useAgents() {
  const [agents, setAgents] = useState<AgentWithStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    // Fetch agents with their status in one go via Supabase directly
    const { data, error } = await supabase
      .from('agents')
      .select('*, agent_status(*)')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setAgents(data.map((a: any) => ({
        ...a,
        online_status: a.agent_status?.[0] ?? null,
        agent_status: undefined,
      })));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();

    // Subscribe to realtime changes on agents table
    const agentsSub = supabase
      .channel('agents-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agents' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_status' }, () => load())
      .subscribe();

    return () => { supabase.removeChannel(agentsSub); };
  }, [load]);

  return { agents, loading, reload: load };
}

export function useAgentSessions(agentId: string) {
  const [sessions, setSessions] = useState<AgentSessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('agent_sessions')
      .select('*')
      .eq('agent_id', agentId)
      .order('started_at', { ascending: false });

    if (!error && data) {
      setSessions(data as AgentSessionRow[]);
    }
    setLoading(false);
  }, [agentId]);

  useEffect(() => {
    load();

    const sub = supabase
      .channel(`sessions-${agentId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'agent_sessions',
        filter: `agent_id=eq.${agentId}`,
      }, () => load())
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, [agentId, load]);

  return { sessions, loading, reload: load };
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/api.ts web/src/hooks/useAgents.ts
git commit -m "feat: add API client and realtime agents/sessions hooks"
```

---

## Task 11: Web - Dashboard Page

**Files:**
- Create: `web/src/components/StatusBadge.tsx`
- Create: `web/src/components/RoleBadge.tsx`
- Create: `web/src/components/AgentCard.tsx`
- Create: `web/src/components/SessionList.tsx`
- Create: `web/src/components/Layout.tsx`
- Create: `web/src/pages/Dashboard.tsx`

- [ ] **Step 1: Create Layout component**

`web/src/components/Layout.tsx`:
```tsx
import { Link, useLocation } from 'react-router';
import { useAuth } from '../hooks/useAuth';
import { Button } from './ui/button';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { signOut } = useAuth();
  const location = useLocation();

  const navItems = [
    { path: '/', label: 'Dashboard' },
    { path: '/pending', label: 'Pending Approval' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link to="/" className="text-lg font-semibold">Agent Nexus</Link>
            <nav className="flex gap-4">
              {navItems.map(item => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`text-sm ${location.pathname === item.path ? 'text-black font-medium' : 'text-gray-500 hover:text-black'}`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut}>Sign out</Button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Create badge components**

`web/src/components/StatusBadge.tsx`:
```tsx
import { Badge } from './ui/badge';

const statusConfig: Record<string, { label: string; className: string }> = {
  online: { label: 'Online', className: 'bg-green-100 text-green-800' },
  offline: { label: 'Offline', className: 'bg-gray-100 text-gray-600' },
  error: { label: 'Error', className: 'bg-red-100 text-red-800' },
};

export default function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] ?? statusConfig.offline;
  return (
    <Badge variant="secondary" className={config.className}>
      <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${
        status === 'online' ? 'bg-green-500 animate-pulse' :
        status === 'error' ? 'bg-red-500' : 'bg-gray-400'
      }`} />
      {config.label}
    </Badge>
  );
}
```

`web/src/components/RoleBadge.tsx`:
```tsx
import { Badge } from './ui/badge';

const roleColors: Record<string, string> = {
  arch: 'bg-purple-100 text-purple-800',
  pmo: 'bg-blue-100 text-blue-800',
  dev: 'bg-emerald-100 text-emerald-800',
  qa: 'bg-amber-100 text-amber-800',
  devops: 'bg-orange-100 text-orange-800',
};

export default function RoleBadge({ role }: { role: string }) {
  return (
    <Badge variant="secondary" className={roleColors[role] ?? 'bg-gray-100 text-gray-800'}>
      {role}
    </Badge>
  );
}
```

- [ ] **Step 3: Create SessionList component**

`web/src/components/SessionList.tsx`:
```tsx
import type { AgentSessionRow } from '@agent-nexus/protocol';
import { Badge } from './ui/badge';

function formatDuration(start: string, end?: string | null): string {
  const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime();
  const mins = Math.floor(ms / 60000);
  const hours = Math.floor(mins / 60);
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  return `${mins}m`;
}

export default function SessionList({ sessions }: { sessions: AgentSessionRow[] }) {
  if (sessions.length === 0) {
    return <p className="text-sm text-gray-500">No sessions</p>;
  }

  return (
    <div className="space-y-2">
      {sessions.map(s => (
        <div key={s.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
          <div className="flex items-center gap-3">
            <Badge variant={s.status === 'active' ? 'default' : 'secondary'} className={
              s.status === 'active' ? 'animate-pulse' : s.status === 'error' ? 'bg-red-100 text-red-800' : ''
            }>
              {s.status}
            </Badge>
            <span className="text-gray-700">{s.task_name ?? '—'}</span>
          </div>
          <div className="flex items-center gap-4 text-gray-500">
            <span>{s.token_used.toLocaleString()}{s.token_limit ? ` / ${s.token_limit.toLocaleString()}` : ''} tokens</span>
            <span>{formatDuration(s.started_at, s.ended_at)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Create AgentCard component**

`web/src/components/AgentCard.tsx`:
```tsx
import { useState } from 'react';
import { Link } from 'react-router';
import { Card, CardContent, CardHeader } from './ui/card';
import { Button } from './ui/button';
import StatusBadge from './StatusBadge';
import RoleBadge from './RoleBadge';
import SessionList from './SessionList';
import type { AgentWithStatus } from '../hooks/useAgents';
import { useAgentSessions } from '../hooks/useAgents';
import { approveAgent, rejectAgent } from '../lib/api';

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function AgentCard({ agent, onAction }: { agent: AgentWithStatus; onAction?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const isPending = agent.status === 'pending_approval';
  const onlineStatus = agent.online_status?.status ?? 'offline';

  return (
    <Card className={`transition-shadow hover:shadow-md ${isPending ? 'border-amber-300 bg-amber-50/50' : ''}`}>
      <CardHeader className="cursor-pointer pb-3" onClick={() => !isPending && setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to={`/agents/${agent.id}`} className="font-semibold hover:underline" onClick={e => e.stopPropagation()}>
              {agent.name}
            </Link>
            <RoleBadge role={agent.role} />
            <span className="text-xs text-gray-400">{agent.agent_type}</span>
          </div>
          <div className="flex items-center gap-3">
            {isPending ? (
              <div className="flex gap-2">
                <Button size="sm" onClick={async (e) => { e.stopPropagation(); await approveAgent(agent.id); onAction?.(); }}>Approve</Button>
                <Button size="sm" variant="destructive" onClick={async (e) => { e.stopPropagation(); await rejectAgent(agent.id); onAction?.(); }}>Reject</Button>
              </div>
            ) : (
              <StatusBadge status={onlineStatus} />
            )}
          </div>
        </div>
        {!isPending && (
          <div className="mt-2 flex gap-6 text-xs text-gray-500">
            <span>{onlineStatus === 'online' ? `Online since ${timeAgo(agent.online_status?.session_start ?? null)}` : `Last seen ${timeAgo(agent.online_status?.last_heartbeat ?? null)}`}</span>
            <span>{agent.online_status?.active_sessions ?? 0} active sessions</span>
            <span>{(agent.online_status?.total_token_used ?? 0).toLocaleString()} total tokens</span>
          </div>
        )}
      </CardHeader>
      {expanded && <ExpandedSessions agentId={agent.id} />}
    </Card>
  );
}

function ExpandedSessions({ agentId }: { agentId: string }) {
  const { sessions, loading } = useAgentSessions(agentId);
  return (
    <CardContent className="border-t pt-3">
      {loading ? <p className="text-sm text-gray-400">Loading sessions...</p> : <SessionList sessions={sessions} />}
    </CardContent>
  );
}
```

- [ ] **Step 5: Create Dashboard page**

`web/src/pages/Dashboard.tsx`:
```tsx
import { useState } from 'react';
import Layout from '../components/Layout';
import AgentCard from '../components/AgentCard';
import { useAgents } from '../hooks/useAgents';
import { Button } from '../components/ui/button';

type Filter = 'all' | 'online' | 'offline' | 'pending';

export default function Dashboard() {
  const { agents, loading, reload } = useAgents();
  const [filter, setFilter] = useState<Filter>('all');

  const counts = {
    total: agents.length,
    online: agents.filter(a => a.online_status?.status === 'online').length,
    offline: agents.filter(a => a.online_status?.status === 'offline' && a.status === 'active').length,
    pending: agents.filter(a => a.status === 'pending_approval').length,
  };

  const filtered = agents.filter(a => {
    if (filter === 'online') return a.online_status?.status === 'online';
    if (filter === 'offline') return a.online_status?.status === 'offline' && a.status === 'active';
    if (filter === 'pending') return a.status === 'pending_approval';
    return true;
  });

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: counts.total },
    { key: 'online', label: 'Online', count: counts.online },
    { key: 'offline', label: 'Offline', count: counts.offline },
    { key: 'pending', label: 'Pending', count: counts.pending },
  ];

  return (
    <Layout>
      {/* Stats bar */}
      <div className="mb-6 flex gap-2">
        {filters.map(f => (
          <Button
            key={f.key}
            variant={filter === f.key ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(f.key)}
          >
            {f.label} ({f.count})
          </Button>
        ))}
      </div>

      {/* Agent list */}
      {loading ? (
        <p className="text-gray-500">Loading agents...</p>
      ) : filtered.length === 0 ? (
        <p className="text-gray-500">No agents found</p>
      ) : (
        <div className="space-y-3">
          {filtered.map(agent => (
            <AgentCard key={agent.id} agent={agent} onAction={reload} />
          ))}
        </div>
      )}
    </Layout>
  );
}
```

- [ ] **Step 6: Verify dashboard renders**

Run:
```bash
pnpm --filter @agent-nexus/web dev
```
Open `http://localhost:5173`. After login, should see dashboard with stats bar and empty agent list (or "No agents found").

- [ ] **Step 7: Commit**

```bash
git add web/src/components/ web/src/pages/Dashboard.tsx
git commit -m "feat: add dashboard with agent cards, status badges, and session list"
```

---

## Task 12: Web - Pending Approval & Agent Detail Pages

**Files:**
- Create: `web/src/pages/PendingApproval.tsx`
- Create: `web/src/pages/AgentDetail.tsx`

- [ ] **Step 1: Create Pending Approval page**

`web/src/pages/PendingApproval.tsx`:
```tsx
import Layout from '../components/Layout';
import { useAgents } from '../hooks/useAgents';
import { approveAgent, rejectAgent } from '../lib/api';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import RoleBadge from '../components/RoleBadge';

export default function PendingApproval() {
  const { agents, loading, reload } = useAgents();
  const pending = agents.filter(a => a.status === 'pending_approval');

  return (
    <Layout>
      <h1 className="mb-4 text-xl font-semibold">Pending Approval</h1>
      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : pending.length === 0 ? (
        <p className="text-gray-500">No pending agents</p>
      ) : (
        <div className="space-y-3">
          {pending.map(agent => (
            <Card key={agent.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-4">
                  <span className="font-medium">{agent.name}</span>
                  <RoleBadge role={agent.role} />
                  <span className="text-sm text-gray-400">{agent.agent_type}</span>
                  <span className="text-sm text-gray-400">{agent.hostname ?? ''}</span>
                  <span className="text-sm text-gray-400">{agent.os ?? ''}</span>
                  <span className="text-xs text-gray-400">Registered {new Date(agent.created_at).toLocaleString()}</span>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={async () => { await approveAgent(agent.id); reload(); }}>Approve</Button>
                  <Button size="sm" variant="destructive" onClick={async () => { await rejectAgent(agent.id); reload(); }}>Reject</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </Layout>
  );
}
```

- [ ] **Step 2: Create Agent Detail page**

`web/src/pages/AgentDetail.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import Layout from '../components/Layout';
import StatusBadge from '../components/StatusBadge';
import RoleBadge from '../components/RoleBadge';
import SessionList from '../components/SessionList';
import { useAgentSessions } from '../hooks/useAgents';
import { fetchAgent, updateAgent, revokeAgent } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Separator } from '../components/ui/separator';
import { ROLES } from '@agent-nexus/protocol';

export default function AgentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [agent, setAgent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState('');
  const { sessions, loading: sessionsLoading } = useAgentSessions(id!);

  useEffect(() => {
    fetchAgent(id!).then(data => {
      setAgent(data);
      setEditName(data.name);
      setEditRole(data.role);
      setLoading(false);
    });
  }, [id]);

  if (loading) return <Layout><p>Loading...</p></Layout>;
  if (!agent) return <Layout><p>Agent not found</p></Layout>;

  const handleSave = async () => {
    const updated = await updateAgent(id!, { name: editName, role: editRole });
    setAgent({ ...agent, ...updated });
  };

  const handleRevoke = async () => {
    if (!confirm('Revoke this agent? This will invalidate its API key.')) return;
    await revokeAgent(id!);
    navigate('/');
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">{agent.name}</h1>
            <RoleBadge role={agent.role} />
            <StatusBadge status={agent.online_status?.status ?? 'offline'} />
          </div>
          <Button variant="destructive" size="sm" onClick={handleRevoke}>Revoke</Button>
        </div>

        {/* Info card */}
        <Card>
          <CardHeader><CardTitle>Agent Info</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-500">Type:</span> {agent.agent_type}</div>
              <div><span className="text-gray-500">Status:</span> {agent.status}</div>
              <div><span className="text-gray-500">Hostname:</span> {agent.hostname ?? '—'}</div>
              <div><span className="text-gray-500">OS:</span> {agent.os ?? '—'}</div>
              <div><span className="text-gray-500">Created:</span> {new Date(agent.created_at).toLocaleString()}</div>
              <div><span className="text-gray-500">Active sessions:</span> {agent.online_status?.active_sessions ?? 0}</div>
              <div><span className="text-gray-500">Total tokens:</span> {(agent.online_status?.total_token_used ?? 0).toLocaleString()}</div>
            </div>
            <Separator />
            <div className="flex items-end gap-4">
              <div className="space-y-1">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={editName} onChange={e => setEditName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="role">Role</Label>
                <select id="role" value={editRole} onChange={e => setEditRole(e.target.value)} className="h-9 rounded-md border px-3 text-sm">
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <Button onClick={handleSave}>Save</Button>
            </div>
          </CardContent>
        </Card>

        {/* Sessions */}
        <Card>
          <CardHeader><CardTitle>Sessions</CardTitle></CardHeader>
          <CardContent>
            {sessionsLoading ? <p className="text-gray-500">Loading...</p> : <SessionList sessions={sessions} />}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
```

- [ ] **Step 3: Verify all pages work**

Run:
```bash
pnpm --filter @agent-nexus/web dev
```
Navigate to `/pending` and `/agents/<some-id>`. Verify pages render without errors.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/PendingApproval.tsx web/src/pages/AgentDetail.tsx
git commit -m "feat: add pending approval and agent detail pages"
```

---

## Task 13: Integration Smoke Test

- [ ] **Step 1: Create a .env file from .env.example**

Copy `.env.example` to `.env` and fill in real Supabase credentials. Create a `web/.env` with `VITE_*` vars.

- [ ] **Step 2: Apply Supabase migration**

Run the SQL from `supabase/migrations/001_initial_schema.sql` in Supabase SQL Editor.

- [ ] **Step 3: Create admin user in Supabase**

In Supabase Dashboard > Authentication > Users, create a user with email/password.

- [ ] **Step 4: Start server and web**

Run:
```bash
pnpm dev
```
Expected: server on port 3000, web on port 5173.

- [ ] **Step 5: Smoke test login**

Open `http://localhost:5173`, should redirect to `/login`. Sign in with admin credentials. Should land on Dashboard.

- [ ] **Step 6: Smoke test WebSocket**

Use `wscat` or a quick script to connect as an agent:
```bash
npx wscat -c ws://localhost:3000
```
Send:
```json
{"type":"register","payload":{"name":"test-agent","agentType":"hermes","role":"dev"},"ts":"2026-04-12T00:00:00Z"}
```
Expected: receive `register.pending` response. Check Dashboard — a pending agent should appear.

- [ ] **Step 7: Smoke test approve**

Click "Approve" on the pending agent in Dashboard. The agent should receive `register.approved` via WebSocket.

- [ ] **Step 8: Commit final state**

```bash
git add -A
git commit -m "chore: integration smoke test verified, project ready for development"
```
