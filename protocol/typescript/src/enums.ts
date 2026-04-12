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
