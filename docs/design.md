# Agent Nexus: Multi-Agent Coordination System

## Overview

Agent Nexus is an independent Node.js service that provides centralized identity management, convention distribution, and status tracking for development AI agents (OpenClaw, Hermes, and future Claude Code). Agents connect via WebSocket, self-register with admin approval, receive role-based work conventions, and continuously report their session status.

## Decisions

| Item | Decision |
|------|----------|
| Package manager | pnpm (workspace monorepo) |
| Runtime | Node.js independent service (Express + ws) |
| Database | Supabase (PostgreSQL + Auth + Realtime) |
| Frontend | Vite + React + shadcn/ui (SPA) |
| Agent communication | WebSocket (bidirectional) |
| Auth model | Agent self-register + admin approve, API Key as unique identity |
| Convention storage | File system, chokidar watch + WebSocket push |
| Role model | Fixed set, code-extensible |
| Agent types | `hermes` (Python plugin), `openclaw` (TS npm plugin) |
| Roles | `arch`, `pmo`, `dev`, `qa`, `devops` |

## Data Model (Supabase PostgreSQL)

### agents table

```sql
CREATE TABLE agents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key       TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  agent_type    TEXT NOT NULL,       -- "hermes" | "openclaw"
  role          TEXT NOT NULL,       -- "arch" | "pmo" | "dev" | "qa" | "devops"
  status        TEXT NOT NULL DEFAULT 'pending_approval',
                                     -- "pending_approval" | "active" | "rejected" | "revoked"
  mac_address   TEXT,
  hostname      TEXT,
  os            TEXT,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### agent_status table

Agent-level aggregated view, not per-session detail.

```sql
CREATE TABLE agent_status (
  agent_id          UUID PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'offline',
                                     -- "online" | "offline" | "error"
  active_sessions   INTEGER DEFAULT 0,
  total_token_used  INTEGER DEFAULT 0,
  session_start     TIMESTAMPTZ,
  last_heartbeat    TIMESTAMPTZ,
  error_message     TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### agent_sessions table

Per-session detail, one agent can have multiple concurrent sessions.

```sql
CREATE TABLE agent_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  task_name     TEXT,
  status        TEXT NOT NULL DEFAULT 'active',
                                     -- "active" | "completed" | "error"
  token_used    INTEGER DEFAULT 0,
  token_limit   INTEGER,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at      TIMESTAMPTZ,
  metadata      JSONB
);
```

### Supabase Realtime

Enable Realtime on `agent_status` and `agent_sessions` tables so the frontend dashboard receives live updates via Supabase subscription without polling.

### Row Level Security (RLS)

- `agents`, `agent_status`, `agent_sessions`: admin (authenticated via Supabase Auth) has full access; server service_role key has full access; no anonymous access.
- RLS policies are enforced at database level. The Node.js server uses the `service_role` key to bypass RLS for agent operations.

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

Admin-only endpoints, authenticated via Supabase Auth JWT（前端登录后自动附带）。Server 验证 JWT 并检查用户是否为 admin。

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

## Agent Nexus UI (Vite + React + shadcn/ui)

### Auth

- Admin 登录使用 Supabase Auth（email + password）
- 初始 admin 账号通过 Supabase Dashboard 手动创建
- 前端用 `@supabase/supabase-js` 的 `signInWithPassword`，session 自动管理
- Agent 认证仍走 WebSocket + API Key，不经过 Supabase Auth

### Pages

#### Login `/login`

- Email + password 登录表单
- 未登录时所有页面重定向到此

#### Dashboard `/`

Agent 状态总览看板，实时更新（Supabase Realtime 订阅 `agent_status` + `agent_sessions`）。

**Agent 卡片列表**，每张卡片展示：

| 字段 | 说明 |
|------|------|
| 名称 | agent name |
| 身份 | role（arch / pmo / dev / qa / devops），用 badge 颜色区分 |
| 类型 | agent_type（hermes / openclaw） |
| 在线状态 | online / offline / error，带颜色指示灯 |
| 上线时间 | session_start，offline 时显示 "最后在线: xxx" |
| Session 数 | active_sessions 数量 |
| Token 用量 | total_token_used |

**点击卡片展开 Session 详情：**

| 字段 | 说明 |
|------|------|
| Session ID | 短 ID |
| 任务名 | task_name，无则显示 "—" |
| 状态 | active（执行中） / completed / error，active 带动画指示 |
| Token 用量 | token_used / token_limit（有 limit 时显示进度条） |
| 开始时间 | started_at |
| 持续时间 | 实时计算 |

**顶部筛选/统计：**

- 统计条：总 agent 数 / 在线数 / 离线数 / 待审批数
- 筛选：按 role、按 agent_type、按在线状态
- 待审批 agent 高亮显示，带 Approve / Reject 按钮

#### Pending Approval `/pending`

- 待审批 agent 列表（独立页面，方便快速处理）
- 显示：name、agent_type、role、hostname、OS、注册时间
- 操作：Approve / Reject
- Approve 后 agent 立即收到 WebSocket `register.approved` 推送

#### Agent Detail `/agents/:id`

- 单个 agent 完整信息
- 基本信息编辑（name、role）
- 历史 session 列表（分页）
- Revoke 操作（吊销 API Key）

### Realtime 更新机制

```
Supabase DB
    |
    ├── agent_status 表变更 ──> Supabase Realtime ──> 前端订阅 ──> 卡片状态实时刷新
    ├── agent_sessions 表变更 ─> Supabase Realtime ──> 前端订阅 ──> session 详情实时刷新
    └── agents 表变更 ─────────> Supabase Realtime ──> 前端订阅 ──> 新 agent 注册时自动出现
```

Node.js server 仍然是 agent 通信的唯一入口（WebSocket），server 将状态写入 Supabase，前端通过 Supabase Realtime 订阅获取更新。前端不直接与 agent 通信。

## Project Structure

```
agent-nexus/
├── pnpm-workspace.yaml            -- workspace: [server, web, plugins/*, protocol/typescript]
├── package.json                   -- root: scripts, shared devDependencies
├── .env                           -- SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
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
│   │   │   ├── supabase.ts       -- Supabase client (service_role)
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
│   ├── package.json
│   └── tsconfig.json
│
├── web/                           -- Agent Nexus UI (Vite + React)
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── lib/
│   │   │   └── supabase.ts       -- Supabase client (anon key)
│   │   ├── hooks/
│   │   │   ├── useAuth.ts
│   │   │   └── useRealtimeAgents.ts
│   │   ├── pages/
│   │   │   ├── Login.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── PendingApproval.tsx
│   │   │   └── AgentDetail.tsx
│   │   └── components/
│   │       ├── AgentCard.tsx
│   │       ├── SessionList.tsx
│   │       ├── StatusBadge.tsx
│   │       └── RoleBadge.tsx
│   ├── package.json
│   ├── vite.config.ts
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
├── supabase/
│   └── migrations/                -- Supabase migration files
│       └── 001_initial_schema.sql
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
