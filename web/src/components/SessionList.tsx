import type { AgentSessionRow } from '@agent-nexus/protocol';
import { Badge } from '@/components/ui/badge';

function formatDuration(start: string, end?: string | null): string {
  const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime();
  const mins = Math.floor(ms / 60000);
  const hours = Math.floor(mins / 60);
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  return `${mins}m`;
}

export default function SessionList({ sessions }: { sessions: AgentSessionRow[] }) {
  if (sessions.length === 0) {
    return <p className="text-sm text-gray-500">No sessions</p>;
  }

  return (
    <div className="space-y-2">
      {sessions.map(s => (
        <div key={s.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
          <div className="flex items-center gap-3">
            <Badge variant={s.status === 'active' ? 'default' : 'secondary'} className={
              s.status === 'active' ? 'animate-pulse' : s.status === 'error' ? 'bg-red-100 text-red-800' : ''
            }>
              {s.status}
            </Badge>
            <span className="text-gray-700">{s.task_name ?? '—'}</span>
          </div>
          <div className="flex items-center gap-4 text-gray-500">
            <span>{s.token_used.toLocaleString()}{s.token_limit ? ` / ${s.token_limit.toLocaleString()}` : ''} tokens</span>
            <span>{formatDuration(s.started_at, s.ended_at)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
