import type { AgentType, Role, AgentStatus, OnlineStatus, SessionStatus, SkillScope } from './enums.js';

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

export interface SkillRow {
  id: string;
  scope: SkillScope;
  content: string;
  created_at: string;
  updated_at: string;
}
