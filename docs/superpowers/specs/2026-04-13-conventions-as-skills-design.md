# Replace Conventions System with Skills

## Problem

The current "conventions" system is a bespoke mechanism for pushing role-scoped rules to agents. It works, but:

1. It's a single-purpose system — only handles convention documents
2. There's no standard triggering mechanism after conventions land on the agent
3. It can't accommodate non-convention skills (e.g., tools, workflows, templates)

## Solution

Replace the entire conventions system with a skills system. Skills use the standard Claude Code skill format (markdown + YAML frontmatter). The data pipeline stays the same: Web UI → Supabase → WebSocket push → Agent writes to `{workspace}/skills/`.

Everything named "convention" in the codebase becomes "skill".

## Data Model

### New `skills` table

```sql
CREATE TABLE skills (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope      TEXT NOT NULL,    -- 'global' | 'arch' | 'pmo' | 'dev' | 'qa' | 'devops'
  title      TEXT NOT NULL,
  description TEXT NOT NULL,   -- one-line description for skill frontmatter
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_skills_scope ON skills(scope);
```

- RLS: anon read, authenticated full access (same as current conventions)
- Realtime: enabled
- The `conventions` table is left in place (not dropped), but no longer used

### Scope values

Unchanged: `global`, `arch`, `pmo`, `dev`, `qa`, `devops`.

## Protocol Changes (protocol/typescript)

| Before | After |
|--------|-------|
| `ConventionRow` | `SkillRow` (adds `description` field) |
| `ConventionScope` | `SkillScope` |
| `ConventionFiles` | `SkillFiles` |

`SkillFiles` type changes to `{ filename: string; description: string; content: string }[]`.

WebSocket message types:
- `conventions.update` → `skills.update`
- `register.approved` / `auth.ok` payload: `conventions` field → `skills`

## Server Changes

### `server/src/skills/` (was `server/src/conventions/`)

**reader.ts:**
- `readSkillsByScope(scope)` — fetch all skills for a scope from Supabase `skills` table
- `getSkillsForRole(role)` — fetch global + role-specific skills

**watcher.ts:**
- Subscribe to Postgres realtime on `skills` table
- On change, read updated skills, invoke callback
- Route global changes to all agents, role-specific to matching agents

### `server/src/api/skills.ts` (was `server/src/api/conventions.ts`)

REST endpoints:

| Method | Path | Action |
|--------|------|--------|
| GET | `/api/skills` | List all skills grouped by scope |
| GET | `/api/skills/scope/:scope` | List skills for a scope |
| GET | `/api/skills/:id` | Get single skill |
| POST | `/api/skills` | Create skill (scope, title, description, content) |
| PUT | `/api/skills/:id` | Update skill |
| DELETE | `/api/skills/:id` | Delete skill |

### WebSocket handler

- `register.approved` / `auth.ok` payloads include `skills` instead of `conventions`
- Push message type: `skills.update` with `{ scope, files }` payload

### `server/src/index.ts`

- Replace convention watcher registration with skill watcher
- Update routing logic (same structure, different names)

## Agent Side (OpenClaw Plugin)

### Directory structure

```
{workspace}/skills/
├── agent-nexus-global/
│   └── SKILL.md
├── agent-nexus-dev/
│   └── SKILL.md
├── agent-nexus-qa/
│   └── SKILL.md
└── ...
```

### SKILL.md format

Each scope produces one SKILL.md. Multiple skills within the same scope are merged as sections:

```markdown
---
name: agent-nexus-{scope}
description: {description}
---

## {title-1}

{content-1}

## {title-2}

{content-2}
```

When a scope has a single skill, description comes from that skill's `description` field. When multiple skills exist in one scope, description is generated as "Agent Nexus {scope} skills".

### `plugins/openclaw/skills.ts` (was `conventions.ts`)

- `writeSkills(baseDir, skills)` — writes global + role SKILL.md files
- `writeSkillUpdate(baseDir, scope, files)` — rewrites a single scope's SKILL.md

### `plugins/openclaw/index.ts`

- `conventionsDir` → `skillsDir`, path changes to `{workspace}/skills`
- Message handlers (`register.approved`, `auth.ok`, `skills.update`) call `writeSkills` / `writeSkillUpdate`

## Web Frontend

### `web/src/pages/Skills.tsx` (was `Conventions.tsx`)

- Same UI structure: list + editor, scope filter, color-coded badges
- Form fields: scope, title, **description** (new), content
- All API calls point to `/api/skills/*`

### `web/src/lib/api.ts`

- `fetchConventions` → `fetchSkills`
- `createConvention` → `createSkill`
- `updateConvention` → `updateSkill`
- `deleteConvention` → `deleteSkill`

### Routing & navigation

- `/conventions` → `/skills`
- Sidebar label: "Conventions" → "Skills"

## End-to-End Flow

### On approve / auth

```
Server sends register.approved / auth.ok with skills payload
  → Plugin receives { global: [...], role: [...] }
  → writeSkills() generates SKILL.md per scope
  → Claude Code skill watcher detects new files
  → Model context updated
```

### On skill change

```
Admin edits skill in Web UI
  → Supabase realtime triggers server watcher
  → Server sends skills.update to relevant agents
  → Plugin receives { scope, files }
  → writeSkillUpdate() regenerates that scope's SKILL.md
  → Claude Code skill watcher detects change
  → Model context refreshed mid-session
```

## What's NOT Changing

- Supabase as storage backend
- WebSocket push mechanism (format changes, pipe doesn't)
- Scope model and values
- RLS policies (same pattern, new table)
- Auth middleware on REST API
