import { useState } from 'react';
import Layout from '../components/Layout';
import AgentCard from '../components/AgentCard';
import { useAgents } from '../hooks/useAgents';
import { Button } from '@/components/ui/button';

type Filter = 'all' | 'online' | 'offline' | 'pending';

export default function Dashboard() {
  const { agents, loading, reload } = useAgents();
  const [filter, setFilter] = useState<Filter>('all');

  const counts = {
    total: agents.length,
    online: agents.filter(a => a.online_status?.status === 'online').length,
    offline: agents.filter(a => a.online_status?.status === 'offline' && a.status === 'active').length,
    pending: agents.filter(a => a.status === 'pending_approval').length,
  };

  const filtered = agents.filter(a => {
    if (filter === 'online') return a.online_status?.status === 'online';
    if (filter === 'offline') return a.online_status?.status === 'offline' && a.status === 'active';
    if (filter === 'pending') return a.status === 'pending_approval';
    return true;
  });

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: counts.total },
    { key: 'online', label: 'Online', count: counts.online },
    { key: 'offline', label: 'Offline', count: counts.offline },
    { key: 'pending', label: 'Pending', count: counts.pending },
  ];

  return (
    <Layout>
      <div className="mb-6 flex gap-2">
        {filters.map(f => (
          <Button
            key={f.key}
            variant={filter === f.key ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(f.key)}
          >
            {f.label} ({f.count})
          </Button>
        ))}
      </div>

      {loading ? (
        <p className="text-gray-500">Loading agents...</p>
      ) : filtered.length === 0 ? (
        <p className="text-gray-500">No agents found</p>
      ) : (
        <div className="space-y-3">
          {filtered.map(agent => (
            <AgentCard key={agent.id} agent={agent} onAction={reload} />
          ))}
        </div>
      )}
    </Layout>
  );
}
