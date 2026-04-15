import { useState } from 'react';
import { Link } from 'react-router';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import StatusBadge from './StatusBadge';
import RoleBadge from './RoleBadge';
import SessionList from './SessionList';
import type { AgentWithStatus } from '../hooks/useAgents';
import { useAgentSessions } from '../hooks/useAgents';
import { approveAgent, rejectAgent, updateAgent, revokeAgent } from '../lib/api';

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
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(agent.name);
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
              <div className="flex items-center gap-2">
                <StatusBadge status={onlineStatus} />
                <Button size="sm" variant="outline" onClick={async (e) => { e.stopPropagation(); setRenaming(true); }}>Rename</Button>
                <Button size="sm" variant="destructive" onClick={async (e) => {
                  e.stopPropagation();
                  if (!confirm(`Delete agent "${agent.name}"? This cannot be undone.`)) return;
                  await revokeAgent(agent.id);
                  onAction?.();
                }}>Delete</Button>
              </div>
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
      {renaming && (
        <CardContent className="border-t pt-3">
          <div className="flex items-center gap-2">
            <Input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="New name"
              className="max-w-xs"
              autoFocus
              onKeyDown={async (e) => {
                if (e.key === 'Enter' && newName.trim()) {
                  await updateAgent(agent.id, { name: newName.trim() });
                  setRenaming(false);
                  onAction?.();
                } else if (e.key === 'Escape') {
                  setRenaming(false);
                  setNewName(agent.name);
                }
              }}
            />
            <Button size="sm" onClick={async () => {
              if (!newName.trim()) return;
              await updateAgent(agent.id, { name: newName.trim() });
              setRenaming(false);
              onAction?.();
            }}>Save</Button>
            <Button size="sm" variant="outline" onClick={() => { setRenaming(false); setNewName(agent.name); }}>Cancel</Button>
          </div>
        </CardContent>
      )}
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
