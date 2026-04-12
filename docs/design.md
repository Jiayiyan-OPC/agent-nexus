# Agent Nexus: Multi-Agent Coordination System

## Overview

Agent Nexus is an independent Node.js service that provides centralized identity management, convention distribution, and status tracking for development AI agents (OpenClaw, Hermes, and future Claude Code). Agents connect via WebSocket, self-register with admin approval, receive role-based work conventions, and continuously report their session status.

## Decisions

| Item | Decision |
|------|----------|
| Runtime | Node.js independent service (Express + ws) |
| Database | SQLite (better-sqlite3) |
| Agent communication | WebSocket (bidirectional) |
| Auth model | Agent self-register + admin approve, API Key as unique identity |
| Convention storage | File system, chokidar watch + WebSocket push |
| Role model | Fixed set, code-extensible |
| Agent types | `hermes` (Python plugin), `openclaw` (TS npm plugin) |
| Roles | `arch`, `pmo`, `dev`, `qa`, `devops` |

## Data Model

### agents table

```sql
CREATE TABLE agents (
  id            TEXT PRIMARY KEY,
  api_key       TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  agent_type    TEXT NOT NULL,       -- "hermes" | "openclaw"
  role          TEXT NOT NULL,       -- "arch" | "pmo" | "dev" | "qa" | "devops"
  status        TEXT NOT NULL DEFAULT 'pending_approval',
                                     -- "pending_approval" | "active" | "rejected" | "revoked"
  mac_address   TEXT,
  hostname      TEXT,
  os            TEXT,
  metadata      TEXT,                -- JSON
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
```

### agent_status table

Agent-level aggregated view, not per-session detail.

```sql
CREATE TABLE agent_status (
  agent_id          TEXT PRIMARY KEY REFERENCES agents(id),
  status            TEXT NOT NULL DEFAULT 'offline',
                                     -- "online" | "offline" | "error"
  active_sessions   INTEGER DEFAULT 0,
  total_token_used  INTEGER DEFAULT 0,
  session_start     TEXT,
  last_heartbeat    TEXT,
  error_message     TEXT,
  updated_at        TEXT NOT NULL
);
```

### agent_sessions table

Per-session detail, one agent can have multiple concurrent sessions.

```sql
CREATE TABLE agent_sessions (
  id            TEXT PRIMARY KEY,
  agent_id      TEXT NOT NULL REFERENCES agents(id),
  task_name     TEXT,
  status        TEXT NOT NULL DEFAULT 'active',
                                     -- "active" | "completed" | "error"
  token_used    INTEGER DEFAULT 0,
  token_limit   INTEGER,
  started_at    TEXT NOT NULL,
  ended_at      TEXT,
  metadata      TEXT                 -- JSON
);
```

### Enums (in code)

```typescript
const ROLES = ['arch', 'pmo', 'dev', 'qa', 'devops'] as const;
type Role = typeof ROLES[number];

const AGENT_TYPES = ['hermes', 'openclaw'] as const;
type AgentType = typeof AGENT_TYPES[number];
```

## WebSocket Protocol

### Message format

All messages follow a unified structure:

```typescript
{
  type: string,
  payload: object,
  ts: string         // ISO 8601
}
```

### Agent -> Server

| type | description | payload |
|------|-------------|---------|
| `register` | First-time self-registration | `{ name, agentType, role, hostname?, mac?, os? }` |
| `auth` | Reconnect with existing key | `{ apiKey, hostname?, mac?, os? }` |
| `session.start` | New session opened | `{ sessionId, taskName?, tokenLimit? }` |
| `session.update` | Session state change | `{ sessionId, tokenUsed?, taskName? }` |
| `session.end` | Session closed | `{ sessionId, status, tokenUsed? }` |
| `heartbeat` | Keep-alive (every 30s) | `{}` |

### Server -> Agent

| type | description | payload |
|------|-------------|---------|
| `auth.ok` | Auth success, onboarding data | `{ agentId, name, role, conventions: { global: string[], role: string[] } }` |
| `auth.fail` | Auth failure | `{ reason }` |
| `register.pending` | Registration received, awaiting approval | `{ agentId, message }` |
| `register.approved` | Admin approved, returns key + conventions | `{ apiKey, agentId, name, role, conventions }` |
| `register.rejected` | Admin rejected | `{ reason }` |
| `conventions.update` | Convention file changed | `{ scope: "global" \| "role", files: { filename: string, content: string }[] }` |
| `heartbeat.ack` | Heartbeat reply | `{}` |
| `error` | Generic error | `{ reason }` |

### Connection lifecycle

```
Agent                          Server                      Admin
  |                              |                           |
  |--- WS connect ------------->|                           |
  |                              |                           |
  |  [No local api_key]         |                           |
  |--- register { name, ... } ->|                           |
  |<-- register.pending --------|                           |
  |              ...waiting...   |-- new agent pending ----->|
  |                              |<-- POST /approve ---------|
  |<-- register.approved -------|                           |
  |    { apiKey, conventions }   |                           |
  |    [persist apiKey locally]  |                           |
  |                              |                           |
  |  [Has local api_key]        |                           |
  |--- auth { apiKey } -------->|  <- "clock in"            |
  |<-- auth.ok { conventions } -|  <- online + latest rules |
  |                              |                           |
  |--- heartbeat (every 30s) -->|                           |
  |<-- heartbeat.ack -----------|                           |
  |                              |                           |
  |--- session.start ---------->|                           |
  |--- session.update --------->|                           |
  |--- session.end ------------->|                           |
  |                              |                           |
  |<-- conventions.update -------|  <- file changed on disk  |
  |                              |                           |
  |--- close ------------------->|  <- "clock out", offline  |
```

### Permission by state

| State | Allowed | Blocked |
|-------|---------|---------|
| Unauthenticated (just connected) | `register`, `auth` | Everything else |
| pending_approval | Hold connection, `heartbeat` | Status upload, conventions, queries |
| active (authenticated) | All operations | -- |

### Timeouts

- Heartbeat interval: 30 seconds
- Offline threshold: 90 seconds without heartbeat
- Auth timeout: 5 seconds after connect, disconnect if no auth/register message
- Duplicate register: if agent disconnects during pending_approval and reconnects without api_key, server matches by (name + agentType + role) and reuses the existing pending record instead of creating a duplicate

## REST API

Admin-only endpoints, authenticated via `Authorization: Bearer <ADMIN_TOKEN>` (env var).

### Agent management

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/agents` | List all agents (filter: `?status=pending`) |
| `GET` | `/api/agents/:id` | Single agent detail + status |
| `POST` | `/api/agents/:id/approve` | Approve pending registration |
| `POST` | `/api/agents/:id/reject` | Reject pending registration |
| `PATCH` | `/api/agents/:id` | Update agent info (name, role) |
| `DELETE` | `/api/agents/:id` | Revoke agent, invalidate key |

### Status queries

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/status` | All agents aggregated status |
| `GET` | `/api/status/:agentId` | Single agent aggregate + active sessions |
| `GET` | `/api/sessions/:agentId` | Agent session history (paginated) |

### Convention queries

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/conventions` | List all convention files (global + all roles) |
| `GET` | `/api/conventions/:role` | Get conventions for a role (includes global) |

Convention modification is done by editing files directly. No write API.

## Convention File System

### Directory structure

```
conventions/
├── global/
│   ├── code-style.md
│   ├── commit-rules.md
│   └── security.md
├── arch/
│   ├── review-standards.md
│   └── design-principles.md
├── pmo/
│   ├── task-management.md
│   └── reporting.md
├── dev/
│   ├── testing-rules.md
│   └── pr-conventions.md
├── qa/
│   └── test-coverage.md
└── devops/
    └── deploy-rules.md
```

### Behavior

- Server watches `conventions/` with chokidar
- `global/` change -> push to all online agents
- `<role>/` change -> push only to agents with that role
- Push full file content, no diff
- Agent onboarding receives: all `global/*` files + all files from their role directory
- Conventions are Markdown, no special format, admin edits directly

## Project Structure

```
agent-nexus/
├── server/
│   ├── src/
│   │   ├── index.ts
│   │   ├── ws/
│   │   │   ├── handler.ts
│   │   │   ├── auth.ts
│   │   │   └── heartbeat.ts
│   │   ├── api/
│   │   │   ├── agents.ts
│   │   │   ├── status.ts
│   │   │   └── conventions.ts
│   │   ├── db/
│   │   │   ├── schema.ts
│   │   │   └── dao.ts
│   │   ├── conventions/
│   │   │   └── watcher.ts
│   │   └── protocol.ts
│   ├── conventions/
│   │   ├── global/
│   │   ├── arch/
│   │   ├── dev/
│   │   ├── pmo/
│   │   ├── qa/
│   │   └── devops/
│   ├── data/
│   ├── package.json
│   └── tsconfig.json
│
├── plugins/
│   ├── openclaw/
│   │   ├── src/
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── hermes/
│       ├── src/
│       │   └── plugin.py
│       └── pyproject.toml
│
├── protocol/
│   ├── typescript/
│   │   └── messages.ts
│   └── python/
│       └── messages.py
│
└── docs/
    └── design.md
```

## Plugin Behavior

### OpenClaw plugin (TypeScript npm package)

- `gateway_start` hook: read local api_key, connect WebSocket. Has key -> `auth` (clock in). No key -> `register`.
- `session_start` hook: send `session.start { sessionId, taskName }`
- `session_end` hook: send `session.end { sessionId, status, tokenUsed }`
- `gateway_stop` hook: graceful WebSocket disconnect
- On `conventions.update`: write to OpenClaw local convention path for agent to pick up
- api_key persisted in OpenClaw plugin config directory

### Hermes plugin (Python)

- `session_start` hook: connect via `websockets` lib, auth or register
- `session_finalize` hook: report idle, disconnect
- Periodic token usage reporting during task execution
- On `conventions.update`: write to `~/.hermes/` convention files
- api_key persisted in `~/.hermes/plugins/` config

### Shared behavior (both plugins)

- Auto-reconnect: exponential backoff (1s, 2s, 4s, max 30s)
- Heartbeat: every 30 seconds
- Convention cache: keep latest conventions locally, use cache when disconnected
- Silent degradation: hub unavailable does not block agent normal operation
