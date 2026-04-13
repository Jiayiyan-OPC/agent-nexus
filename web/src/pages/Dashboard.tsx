import Layout from '../components/Layout';
import { useAgents } from '../hooks/useAgents';
import StatusBadge from '../components/StatusBadge';
import RoleBadge from '../components/RoleBadge';
import { Link } from 'react-router';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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

export default function Dashboard() {
  const { agents, loading } = useAgents();
  const active = agents.filter(a => a.status === 'active');

  return (
    <Layout>
      <h1 className="mb-4 text-xl font-semibold">Agents</h1>
      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : active.length === 0 ? (
        <p className="text-gray-500">No agents</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Sessions</TableHead>
              <TableHead>Tokens</TableHead>
              <TableHead>Last Seen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {active.map(agent => {
              const online = agent.online_status?.status ?? 'offline';
              return (
                <TableRow key={agent.id}>
                  <TableCell>
                    <Link to={`/agents/${agent.id}`} className="font-medium hover:underline">
                      {agent.name}
                    </Link>
                    <span className="ml-2 text-xs text-gray-400">{agent.agent_type}</span>
                  </TableCell>
                  <TableCell><RoleBadge role={agent.role} /></TableCell>
                  <TableCell><StatusBadge status={online} /></TableCell>
                  <TableCell>{agent.online_status?.active_sessions ?? 0}</TableCell>
                  <TableCell>{(agent.online_status?.total_token_used ?? 0).toLocaleString()}</TableCell>
                  <TableCell className="text-gray-500 text-sm">
                    {online === 'online'
                      ? `Online since ${timeAgo(agent.online_status?.session_start ?? null)}`
                      : timeAgo(agent.online_status?.last_heartbeat ?? null)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Layout>
  );
}
