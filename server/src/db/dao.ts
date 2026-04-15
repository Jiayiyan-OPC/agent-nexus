import { v4 as uuidv4 } from 'uuid';
import { supabase } from './supabase.js';
import type { AgentRow, AgentStatusRow, AgentSessionRow, AgentEventRow, AgentEventState, AgentStatus, OnlineStatus, SessionStatus } from '@agent-nexus/protocol';

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
  if (error && error.code === 'PGRST116') return null;
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

export async function findAgentByIdentity(name: string, agentType: string, role: string): Promise<AgentRow | null> {
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .eq('name', name)
    .eq('agent_type', agentType)
    .eq('role', role)
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
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as AgentRow;
}

export async function updateAgent(id: string, fields: { name?: string; role?: string }): Promise<AgentRow> {
  const { data, error } = await supabase
    .from('agents')
    .update({ ...fields, updated_at: new Date().toISOString() })
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
    .update({ status: 'online' as OnlineStatus, session_start: new Date().toISOString(), last_heartbeat: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('agent_id', agentId);
  if (error) throw error;
}

export async function setAgentOffline(agentId: string): Promise<void> {
  const { error } = await supabase
    .from('agent_status')
    .update({ status: 'offline' as OnlineStatus, active_sessions: 0, updated_at: new Date().toISOString() })
    .eq('agent_id', agentId);
  if (error) throw error;
}

export async function updateHeartbeat(agentId: string): Promise<void> {
  const { error } = await supabase
    .from('agent_status')
    .update({ last_heartbeat: new Date().toISOString(), updated_at: new Date().toISOString() })
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

// --- Agent Events ---

export async function insertEventAudit(params: {
  eventId: string;
  correlationId?: string;
  threadId?: string;
  eventType: string;
  sourceAgentId?: string;
  targetAgentId?: string;
  sourceContext?: Record<string, unknown>;
  payload: Record<string, unknown>;
  state: AgentEventState;
  errorMessage?: string;
}): Promise<void> {
  const { error } = await supabase
    .from('agent_events')
    .insert({
      event_id: params.eventId,
      correlation_id: params.correlationId ?? null,
      thread_id: params.threadId ?? null,
      event_type: params.eventType,
      source_agent_id: params.sourceAgentId ?? null,
      target_agent_id: params.targetAgentId ?? null,
      source_context: params.sourceContext ?? null,
      payload: params.payload,
      state: params.state,
      error_message: params.errorMessage ?? null,
    });
  if (error) throw error;
}

export async function getEventsByTarget(
  targetAgentId: string,
  options?: { limit?: number; since?: string },
): Promise<AgentEventRow[]> {
  let query = supabase
    .from('agent_events')
    .select('*')
    .eq('target_agent_id', targetAgentId)
    .order('created_at', { ascending: false });
  if (options?.since) query = query.gte('created_at', options.since);
  if (options?.limit) query = query.limit(options.limit);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as AgentEventRow[];
}

export async function getEventsBySource(
  sourceAgentId: string,
  options?: { limit?: number; since?: string },
): Promise<AgentEventRow[]> {
  let query = supabase
    .from('agent_events')
    .select('*')
    .eq('source_agent_id', sourceAgentId)
    .order('created_at', { ascending: false });
  if (options?.since) query = query.gte('created_at', options.since);
  if (options?.limit) query = query.limit(options.limit);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as AgentEventRow[];
}

export async function updateEventState(
  id: string,
  state: AgentEventState,
  errorMessage?: string,
): Promise<void> {
  const update: Record<string, unknown> = { state };
  if (errorMessage !== undefined) update.error_message = errorMessage;
  const { error } = await supabase
    .from('agent_events')
    .update(update)
    .eq('id', id);
  if (error) throw error;
}
