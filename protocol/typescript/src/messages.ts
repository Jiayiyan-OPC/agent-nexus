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
