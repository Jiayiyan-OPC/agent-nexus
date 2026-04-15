import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { AgentRow, AgentStatusRow, AgentSessionRow } from '@agent-nexus/protocol';

export interface AgentWithStatus extends AgentRow {
  online_status: AgentStatusRow | null;
}

export function useAgents() {
  const [agents, setAgents] = useState<AgentWithStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('agents')
      .select('*, agent_status(*)')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setAgents(data.map((a: any) => ({
        ...a,
        online_status: Array.isArray(a.agent_status) ? a.agent_status[0] ?? null : a.agent_status ?? null,
        agent_status: undefined,
      })));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();

    // Subscribe to agents table changes (insert/update/delete)
    const agentsSub = supabase
      .channel('agents-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agents' }, () => load())
      .subscribe();

    // Subscribe to status broadcast channel (replaces agent_status postgres_changes)
    const statusSub = supabase
      .channel('agent-status-changes')
      .on('broadcast', { event: 'status-change' }, (payload) => {
        // Update the specific agent's status in-place without refetching all
        setAgents(prev => prev.map(agent => {
          if (agent.id !== payload.payload?.agentId) return agent;
          return {
            ...agent,
            online_status: agent.online_status
              ? {
                  ...agent.online_status,
                  status: payload.payload.status ?? agent.online_status.status,
                  active_sessions: payload.payload.activeSessions ?? agent.online_status.active_sessions,
                  total_token_used: payload.payload.totalTokenUsed ?? agent.online_status.total_token_used,
                }
              : agent.online_status,
          };
        }));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(agentsSub);
      supabase.removeChannel(statusSub);
    };
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

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedLoad = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(load, 400);
    };

    const sub = supabase
      .channel(`sessions-${agentId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'agent_sessions',
        filter: `agent_id=eq.${agentId}`,
      }, () => debouncedLoad())
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(sub);
    };
  }, [agentId, load]);

  return { sessions, loading, reload: load };
}
