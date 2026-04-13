# Conventions → Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the entire conventions system with a skills system using standard Claude Code skill format, across DB, protocol, server, agent plugin, and web frontend.

**Architecture:** Rename-and-extend approach. Every "convention" reference becomes "skill". New `skills` DB table adds a `description` field. The WebSocket push pipeline stays the same, only message types and payload field names change. Agent plugin writes SKILL.md files with frontmatter to `{workspace}/skills/`.

**Tech Stack:** TypeScript, Supabase (Postgres), Express, WebSocket, React, Node.js fs

---

### Task 1: Create `skills` database migration

**Files:**
- Create: `supabase/migrations/003_skills_table.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Skills table (replaces conventions)
CREATE TABLE skills (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope      TEXT NOT NULL CHECK (scope IN ('global', 'arch', 'pmo', 'dev', 'qa', 'devops')),
  title      TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_skills_scope ON skills(scope);

-- RLS
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon read access to skills"
  ON skills FOR SELECT TO anon USING (true);

CREATE POLICY "Authenticated users have full access to skills"
  ON skills FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE skills;
```

- [ ] **Step 2: Apply migration**

Run: `npx supabase db push` or apply via Supabase dashboard.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/003_skills_table.sql
git commit -m "feat: add skills table migration"
```

---

### Task 2: Update protocol types

**Files:**
- Modify: `protocol/typescript/src/enums.ts` (lines 16-17)
- Modify: `protocol/typescript/src/tables.ts` (lines 41-48, plus import on line 1)
- Modify: `protocol/typescript/src/messages.ts` (lines 56-94)

- [ ] **Step 1: Update enums.ts — rename ConventionScope to SkillScope**

Replace lines 16-17:

```typescript
export const SKILL_SCOPES = ['global', ...ROLES] as const;
export type SkillScope = typeof SKILL_SCOPES[number];
```

- [ ] **Step 2: Update tables.ts — rename ConventionRow to SkillRow, add description**

Replace the import and interface:

```typescript
import type { AgentType, Role, AgentStatus, OnlineStatus, SessionStatus, SkillScope } from './enums.js';
```

Replace the `ConventionRow` interface:

```typescript
export interface SkillRow {
  id: string;
  scope: SkillScope;
  title: string;
  description: string;
  content: string;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 3: Update messages.ts — rename all convention types to skill types**

Replace the full file content:

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

export type SkillFiles = { filename: string; description: string; content: string }[];

export type AuthOkPayload = {
  agentId: string;
  name: string;
  role: Role;
  skills: { global: SkillFiles; role: SkillFiles };
};

export type AuthFailPayload = { reason: string };

export type RegisterPendingPayload = { agentId: string; message: string };

export type RegisterApprovedPayload = {
  apiKey: string;
  agentId: string;
  name: string;
  role: Role;
  skills: { global: SkillFiles; role: SkillFiles };
};

export type RegisterRejectedPayload = { reason: string };

export type SkillsUpdatePayload = {
  scope: 'global' | 'role';
  files: SkillFiles;
};

export type ErrorPayload = { reason: string };

export type ServerToAgent =
  | WsMessage<'auth.ok', AuthOkPayload>
  | WsMessage<'auth.fail', AuthFailPayload>
  | WsMessage<'register.pending', RegisterPendingPayload>
  | WsMessage<'register.approved', RegisterApprovedPayload>
  | WsMessage<'register.rejected', RegisterRejectedPayload>
  | WsMessage<'skills.update', SkillsUpdatePayload>
  | WsMessage<'heartbeat.ack', Record<string, never>>
  | WsMessage<'error', ErrorPayload>;
```

- [ ] **Step 4: Verify protocol builds**

Run: `cd protocol/typescript && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add protocol/typescript/src/enums.ts protocol/typescript/src/tables.ts protocol/typescript/src/messages.ts
git commit -m "feat: rename convention protocol types to skill types"
```

---

### Task 3: Create server skill reader and watcher

**Files:**
- Create: `server/src/skills/reader.ts`
- Create: `server/src/skills/watcher.ts`
- Delete: `server/src/conventions/reader.ts`
- Delete: `server/src/conventions/watcher.ts`

- [ ] **Step 1: Create `server/src/skills/reader.ts`**

```typescript
import { supabase } from '../db/supabase.js';
import type { SkillFiles } from '@agent-nexus/protocol';

export async function readSkillsByScope(scope: string): Promise<SkillFiles> {
  const { data, error } = await supabase
    .from('skills')
    .select('title, description, content')
    .eq('scope', scope)
    .order('title');
  if (error) throw error;
  return (data ?? []).map(row => ({ filename: row.title, description: row.description, content: row.content }));
}

export async function getSkillsForRole(role: string): Promise<{ global: SkillFiles; role: SkillFiles }> {
  const [global, roleFiles] = await Promise.all([
    readSkillsByScope('global'),
    readSkillsByScope(role),
  ]);
  return { global, role: roleFiles };
}
```

- [ ] **Step 2: Create `server/src/skills/watcher.ts`**

```typescript
import { supabase } from '../db/supabase.js';
import { readSkillsByScope } from './reader.js';
import type { SkillFiles } from '@agent-nexus/protocol';

export type SkillChangeHandler = (event: {
  scope: 'global' | 'role';
  role?: string;
  files: SkillFiles;
}) => void;

export function watchSkills(onChange: SkillChangeHandler): void {
  supabase
    .channel('skills-changes')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'skills',
    }, async (payload) => {
      try {
        const row = (payload.new as any) || (payload.old as any);
        if (!row?.scope) return;

        const scope = row.scope as string;
        const files = await readSkillsByScope(scope);

        if (scope === 'global') {
          onChange({ scope: 'global', files });
        } else {
          onChange({ scope: 'role', role: scope, files });
        }
      } catch (err) {
        console.error('[skills] Watcher error:', err);
      }
    })
    .subscribe();
}
```

- [ ] **Step 3: Delete old convention files**

```bash
rm server/src/conventions/reader.ts server/src/conventions/watcher.ts
rmdir server/src/conventions
```

- [ ] **Step 4: Verify server compiles (will fail until Task 4 is done — that's expected)**

- [ ] **Step 5: Commit**

```bash
git add server/src/skills/reader.ts server/src/skills/watcher.ts
git rm server/src/conventions/reader.ts server/src/conventions/watcher.ts
git commit -m "feat: replace convention reader/watcher with skill reader/watcher"
```

---

### Task 4: Create server skill REST API

**Files:**
- Create: `server/src/api/skills.ts`
- Delete: `server/src/api/conventions.ts`

- [ ] **Step 1: Create `server/src/api/skills.ts`**

```typescript
import { Router, type IRouter } from 'express';
import { supabase } from '../db/supabase.js';
import { SKILL_SCOPES } from '@agent-nexus/protocol';
import type { SkillRow } from '@agent-nexus/protocol';

export const skillsRouter: IRouter = Router();

// GET /api/skills — list all skills grouped by scope
skillsRouter.get('/', async (_req, res) => {
  const { data, error } = await supabase
    .from('skills')
    .select('*')
    .order('scope')
    .order('title');
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data as SkillRow[]);
});

// GET /api/skills/scope/:scope — list skills for a scope
skillsRouter.get('/scope/:scope', async (req, res) => {
  const scope = req.params.scope;
  if (!SKILL_SCOPES.includes(scope as any)) {
    res.status(400).json({ error: `Invalid scope: ${scope}` });
    return;
  }
  const { data, error } = await supabase
    .from('skills')
    .select('*')
    .eq('scope', scope)
    .order('title');
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data as SkillRow[]);
});

// GET /api/skills/:id — get single skill
skillsRouter.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('skills')
    .select('*')
    .eq('id', req.params.id)
    .single();
  if (error) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(data as SkillRow);
});

// POST /api/skills — create a skill
skillsRouter.post('/', async (req, res) => {
  const { scope, title, description, content } = req.body;
  if (!scope || !title || !description || content === undefined) {
    res.status(400).json({ error: 'scope, title, description, and content are required' });
    return;
  }
  if (!SKILL_SCOPES.includes(scope as any)) {
    res.status(400).json({ error: `Invalid scope: ${scope}` });
    return;
  }
  const { data, error } = await supabase
    .from('skills')
    .insert({ scope, title, description, content })
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(201).json(data as SkillRow);
});

// PUT /api/skills/:id — update a skill
skillsRouter.put('/:id', async (req, res) => {
  const { scope, title, description, content } = req.body;
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (scope !== undefined) {
    if (!SKILL_SCOPES.includes(scope as any)) {
      res.status(400).json({ error: `Invalid scope: ${scope}` });
      return;
    }
    update.scope = scope;
  }
  if (title !== undefined) update.title = title;
  if (description !== undefined) update.description = description;
  if (content !== undefined) update.content = content;

  const { data, error } = await supabase
    .from('skills')
    .update(update)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data as SkillRow);
});

// DELETE /api/skills/:id — delete a skill
skillsRouter.delete('/:id', async (req, res) => {
  const { error } = await supabase
    .from('skills')
    .delete()
    .eq('id', req.params.id);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ ok: true });
});
```

- [ ] **Step 2: Delete old conventions API**

```bash
rm server/src/api/conventions.ts
```

- [ ] **Step 3: Commit**

```bash
git add server/src/api/skills.ts
git rm server/src/api/conventions.ts
git commit -m "feat: replace conventions REST API with skills REST API"
```

---

### Task 5: Update server index.ts and WebSocket handler

**Files:**
- Modify: `server/src/index.ts` (lines 8, 14, 27, 39-49)
- Modify: `server/src/ws/handler.ts` (lines 5, 114-119, 182-187, 202-206)

- [ ] **Step 1: Update `server/src/index.ts`**

Replace import of `watchConventions`:
```typescript
// old
import { watchConventions } from './conventions/watcher.js';
// new
import { watchSkills } from './skills/watcher.js';
```

Replace import of `conventionsRouter`:
```typescript
// old
import { conventionsRouter } from './api/conventions.js';
// new
import { skillsRouter } from './api/skills.js';
```

Replace route mount:
```typescript
// old
app.use('/api/conventions', requireAuth, conventionsRouter);
// new
app.use('/api/skills', requireAuth, skillsRouter);
```

Replace watcher block (lines 39-49):
```typescript
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
```

- [ ] **Step 2: Update `server/src/ws/handler.ts`**

Replace import:
```typescript
// old
import { getConventionsForRole } from '../conventions/reader.js';
// new
import { getSkillsForRole } from '../skills/reader.js';
```

In `handleRegister` — replace conventions lookup and payload:
```typescript
// old
const conventions = await getConventionsForRole(existing.role);
send(ws, {
  type: 'register.approved',
  payload: { apiKey: existing.api_key, agentId: existing.id, name: existing.name, role: existing.role, conventions },
  ts: '',
});
// new
const skills = await getSkillsForRole(existing.role);
send(ws, {
  type: 'register.approved',
  payload: { apiKey: existing.api_key, agentId: existing.id, name: existing.name, role: existing.role, skills },
  ts: '',
});
```

In `handleAuth` — same pattern:
```typescript
// old
const conventions = await getConventionsForRole(agent.role);
send(ws, {
  type: 'auth.ok',
  payload: { agentId: agent.id, name: agent.name, role: agent.role, conventions },
  ts: '',
});
// new
const skills = await getSkillsForRole(agent.role);
send(ws, {
  type: 'auth.ok',
  payload: { agentId: agent.id, name: agent.name, role: agent.role, skills },
  ts: '',
});
```

In `notifyAgentApproved` — same pattern:
```typescript
// old
const conventions = await getConventionsForRole(agent.role);
send(agentConn.ws, {
  type: 'register.approved',
  payload: { apiKey: agent.api_key, agentId: agent.id, name: agent.name, role: agent.role, conventions },
  ts: '',
});
// new
const skills = await getSkillsForRole(agent.role);
send(agentConn.ws, {
  type: 'register.approved',
  payload: { apiKey: agent.api_key, agentId: agent.id, name: agent.name, role: agent.role, skills },
  ts: '',
});
```

- [ ] **Step 3: Verify server compiles**

Run: `cd server && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add server/src/index.ts server/src/ws/handler.ts
git commit -m "feat: wire up skills watcher, router, and WS handler"
```

---

### Task 6: Update OpenClaw plugin

**Files:**
- Modify: `plugins/openclaw/conventions.ts` → rename to `plugins/openclaw/skills.ts`
- Modify: `plugins/openclaw/index.ts`

- [ ] **Step 1: Rename and update `plugins/openclaw/conventions.ts` → `plugins/openclaw/skills.ts`**

```bash
mv plugins/openclaw/conventions.ts plugins/openclaw/skills.ts
```

Replace the full content of `plugins/openclaw/skills.ts`:

```typescript
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type SkillFile = { filename: string; description: string; content: string };

function buildSkillMd(name: string, description: string, files: SkillFile[]): string {
  const sections = files
    .map((f) => `## ${f.filename}\n\n${f.content}`)
    .join('\n\n');

  return `---
name: ${name}
description: ${description}
---

${sections}
`;
}

function scopeDescription(scope: string, files: SkillFile[]): string {
  if (files.length === 1) return files[0].description;
  return `Agent Nexus ${scope} skills`;
}

export async function writeSkills(
  baseDir: string,
  role: string,
  skills: { global: SkillFile[]; role: SkillFile[] },
): Promise<void> {
  if (skills.global.length > 0) {
    const dir = join(baseDir, 'agent-nexus-global');
    await mkdir(dir, { recursive: true });
    const content = buildSkillMd(
      'agent-nexus-global',
      scopeDescription('global', skills.global),
      skills.global,
    );
    await writeFile(join(dir, 'SKILL.md'), content, 'utf-8');
  }

  if (skills.role.length > 0) {
    const dir = join(baseDir, `agent-nexus-${role}`);
    await mkdir(dir, { recursive: true });
    const content = buildSkillMd(
      `agent-nexus-${role}`,
      scopeDescription(role, skills.role),
      skills.role,
    );
    await writeFile(join(dir, 'SKILL.md'), content, 'utf-8');
  }
}

export async function writeSkillUpdate(
  baseDir: string,
  scope: string,
  role: string,
  files: SkillFile[],
): Promise<void> {
  const dirName = scope === 'global' ? 'agent-nexus-global' : `agent-nexus-${role}`;
  const name = scope === 'global' ? 'agent-nexus-global' : `agent-nexus-${role}`;

  const dir = join(baseDir, dirName);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'SKILL.md'), buildSkillMd(name, scopeDescription(scope === 'global' ? 'global' : role, files), files), 'utf-8');
}
```

- [ ] **Step 2: Update `plugins/openclaw/index.ts`**

Replace import:
```typescript
// old
import { writeConventions, writeConventionUpdate } from './conventions.js';
// new
import { writeSkills, writeSkillUpdate } from './skills.js';
```

Replace `conventionsDir` variable (wherever it's defined):
```typescript
// old
const conventionsDir = '...';
// new
const skillsDir = '...'; // same base path, e.g. join(workspaceDir, 'skills')
```

Replace message handlers:
```typescript
// old
case 'auth.ok':
  api.logger.info(`[nexus] Authenticated as ${msg.payload.name} (${msg.payload.role})`);
  writeConventions(conventionsDir, msg.payload.conventions).catch(() => {});
  break;

case 'register.approved':
  state.apiKey = msg.payload.apiKey;
  state.agentId = msg.payload.agentId;
  saveState().catch(() => {});
  api.logger.info(`[nexus] Approved! Connected as ${msg.payload.name} (${msg.payload.role})`);
  writeConventions(conventionsDir, msg.payload.conventions).catch(() => {});
  break;

case 'conventions.update':
  writeConventionUpdate(conventionsDir, msg.payload.scope, msg.payload.files).catch(() => {});
  api.logger.info(`[nexus] Conventions updated (${msg.payload.scope})`);
  break;

// new
case 'auth.ok':
  api.logger.info(`[nexus] Authenticated as ${msg.payload.name} (${msg.payload.role})`);
  writeSkills(skillsDir, msg.payload.role, msg.payload.skills).catch(() => {});
  break;

case 'register.approved':
  state.apiKey = msg.payload.apiKey;
  state.agentId = msg.payload.agentId;
  saveState().catch(() => {});
  api.logger.info(`[nexus] Approved! Connected as ${msg.payload.name} (${msg.payload.role})`);
  writeSkills(skillsDir, msg.payload.role, msg.payload.skills).catch(() => {});
  break;

case 'skills.update':
  writeSkillUpdate(skillsDir, msg.payload.scope, state.role, msg.payload.files).catch(() => {});
  api.logger.info(`[nexus] Skills updated (${msg.payload.scope})`);
  break;
```

- [ ] **Step 3: Commit**

```bash
git rm plugins/openclaw/conventions.ts
git add plugins/openclaw/skills.ts plugins/openclaw/index.ts
git commit -m "feat: update OpenClaw plugin to write Claude Code skill format"
```

---

### Task 7: Update web frontend — API client and types

**Files:**
- Modify: `web/src/lib/api.ts` (lines 58-89)

- [ ] **Step 1: Replace convention API functions with skill API functions**

Replace the `// --- Conventions ---` section:

```typescript
// --- Skills ---

export async function fetchSkills() {
  const res = await authFetch('/api/skills');
  return res.json();
}

export async function fetchSkill(id: string) {
  const res = await authFetch(`/api/skills/${id}`);
  return res.json();
}

export async function createSkill(data: { scope: string; title: string; description: string; content: string }) {
  const res = await authFetch('/api/skills', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateSkill(id: string, data: { scope?: string; title?: string; description?: string; content?: string }) {
  const res = await authFetch(`/api/skills/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteSkill(id: string) {
  const res = await authFetch(`/api/skills/${id}`, { method: 'DELETE' });
  return res.json();
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/lib/api.ts
git commit -m "feat: replace convention API client with skills API client"
```

---

### Task 8: Update web frontend — Skills page

**Files:**
- Create: `web/src/pages/Skills.tsx` (replaces `web/src/pages/Conventions.tsx`)
- Delete: `web/src/pages/Conventions.tsx`

- [ ] **Step 1: Create `web/src/pages/Skills.tsx`**

```tsx
import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { fetchSkills, createSkill, updateSkill, deleteSkill } from '../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import type { SkillRow } from '@agent-nexus/protocol';
import { SKILL_SCOPES } from '@agent-nexus/protocol';

const scopeColors: Record<string, string> = {
  global: 'bg-gray-100 text-gray-800',
  arch: 'bg-purple-100 text-purple-800',
  pmo: 'bg-blue-100 text-blue-800',
  dev: 'bg-emerald-100 text-emerald-800',
  qa: 'bg-amber-100 text-amber-800',
  devops: 'bg-orange-100 text-orange-800',
};

export default function Skills() {
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<SkillRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [filterScope, setFilterScope] = useState<string>('all');

  // Form state
  const [formScope, setFormScope] = useState('global');
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formContent, setFormContent] = useState('');

  const load = async () => {
    const data = await fetchSkills();
    setSkills(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = filterScope === 'all'
    ? skills
    : skills.filter(s => s.scope === filterScope);

  const startCreate = () => {
    setEditing(null);
    setCreating(true);
    setFormScope('global');
    setFormTitle('');
    setFormDescription('');
    setFormContent('');
  };

  const startEdit = (s: SkillRow) => {
    setCreating(false);
    setEditing(s);
    setFormScope(s.scope);
    setFormTitle(s.title);
    setFormDescription(s.description);
    setFormContent(s.content);
  };

  const cancelForm = () => {
    setEditing(null);
    setCreating(false);
  };

  const handleSave = async () => {
    if (creating) {
      await createSkill({ scope: formScope, title: formTitle, description: formDescription, content: formContent });
    } else if (editing) {
      await updateSkill(editing.id, { scope: formScope, title: formTitle, description: formDescription, content: formContent });
    }
    cancelForm();
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this skill?')) return;
    await deleteSkill(id);
    load();
  };

  const isFormOpen = creating || editing !== null;

  return (
    <Layout>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Skills</h1>
        <Button size="sm" onClick={startCreate}>New Skill</Button>
      </div>

      {/* Scope filter */}
      <div className="flex gap-2 mb-4">
        <Button size="sm" variant={filterScope === 'all' ? 'default' : 'outline'} onClick={() => setFilterScope('all')}>
          All ({skills.length})
        </Button>
        {SKILL_SCOPES.map(s => {
          const count = skills.filter(sk => sk.scope === s).length;
          return (
            <Button key={s} size="sm" variant={filterScope === s ? 'default' : 'outline'} onClick={() => setFilterScope(s)}>
              {s} ({count})
            </Button>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* List */}
        <div className={isFormOpen ? 'col-span-1' : 'col-span-3'}>
          {loading ? (
            <p className="text-gray-500">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="text-gray-500">No skills</p>
          ) : (
            <div className="space-y-2">
              {filtered.map(s => (
                <Card
                  key={s.id}
                  className={`cursor-pointer transition-shadow hover:shadow-md ${editing?.id === s.id ? 'ring-2 ring-primary' : ''}`}
                  onClick={() => startEdit(s)}
                >
                  <CardContent className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary" className={scopeColors[s.scope] ?? ''}>
                        {s.scope}
                      </Badge>
                      <div>
                        <span className="font-medium">{s.title}</span>
                        <p className="text-xs text-gray-500">{s.description}</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-500 hover:text-red-700"
                      onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
                    >
                      Delete
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Editor */}
        {isFormOpen && (
          <div className="col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>{creating ? 'New Skill' : 'Edit Skill'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="scope">Scope</Label>
                    <select
                      id="scope"
                      value={formScope}
                      onChange={e => setFormScope(e.target.value)}
                      className="h-9 w-full rounded-md border px-3 text-sm"
                    >
                      {SKILL_SCOPES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="title">Title</Label>
                    <Input id="title" value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="e.g. code-style" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="description">Description</Label>
                  <Input id="description" value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="One-line description for skill discovery" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="content">Content (Markdown)</Label>
                  <textarea
                    id="content"
                    value={formContent}
                    onChange={e => setFormContent(e.target.value)}
                    className="w-full h-80 rounded-md border px-3 py-2 text-sm font-mono resize-y"
                    placeholder="Write your skill content here..."
                  />
                </div>
                <Separator />
                <div className="flex gap-2">
                  <Button onClick={handleSave} disabled={!formTitle || !formDescription || !formContent}>Save</Button>
                  <Button variant="outline" onClick={cancelForm}>Cancel</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </Layout>
  );
}
```

- [ ] **Step 2: Delete old Conventions page**

```bash
rm web/src/pages/Conventions.tsx
```

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/Skills.tsx
git rm web/src/pages/Conventions.tsx
git commit -m "feat: replace Conventions page with Skills page"
```

---

### Task 9: Update routing and navigation

**Files:**
- Modify: `web/src/App.tsx` (lines 7-8, 27)
- Modify: `web/src/components/Layout.tsx` (line 11)

- [ ] **Step 1: Update `web/src/App.tsx`**

Replace import:
```typescript
// old
import Conventions from './pages/Conventions';
// new
import Skills from './pages/Skills';
```

Replace route:
```typescript
// old
<Route path="/conventions" element={<ProtectedRoute><Conventions /></ProtectedRoute>} />
// new
<Route path="/skills" element={<ProtectedRoute><Skills /></ProtectedRoute>} />
```

- [ ] **Step 2: Update `web/src/components/Layout.tsx`**

Replace navigation item:
```typescript
// old
{ path: '/conventions', label: 'Conventions' },
// new
{ path: '/skills', label: 'Skills' },
```

- [ ] **Step 3: Verify frontend builds**

Run: `cd web && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add web/src/App.tsx web/src/components/Layout.tsx
git commit -m "feat: update routing and navigation from conventions to skills"
```

---

### Task 10: Clean up old migration references

**Files:**
- Modify: `web/.gitignore` (if it references conventions)

- [ ] **Step 1: Check for any remaining "convention" references across the codebase**

Run: `grep -ri "convention" --include="*.ts" --include="*.tsx" --include="*.sql" --include="*.md" -l`

Fix any remaining references.

- [ ] **Step 2: Final full build verification**

Run from project root:
```bash
cd protocol/typescript && npx tsc --noEmit && cd ../../server && npx tsc --noEmit && cd ../web && npx tsc --noEmit
```
Expected: all three pass with no errors

- [ ] **Step 3: Commit any remaining fixes**

```bash
git add -A
git commit -m "chore: clean up remaining convention references"
```
