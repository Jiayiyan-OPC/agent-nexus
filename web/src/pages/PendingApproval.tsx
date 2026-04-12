import Layout from '../components/Layout';
import { useAgents } from '../hooks/useAgents';
import { approveAgent, rejectAgent } from '../lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import RoleBadge from '../components/RoleBadge';

export default function PendingApproval() {
  const { agents, loading, reload } = useAgents();
  const pending = agents.filter(a => a.status === 'pending_approval');

  return (
    <Layout>
      <h1 className="mb-4 text-xl font-semibold">Pending Approval</h1>
      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : pending.length === 0 ? (
        <p className="text-gray-500">No pending agents</p>
      ) : (
        <div className="space-y-3">
          {pending.map(agent => (
            <Card key={agent.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-4">
                  <span className="font-medium">{agent.name}</span>
                  <RoleBadge role={agent.role} />
                  <span className="text-sm text-gray-400">{agent.agent_type}</span>
                  <span className="text-sm text-gray-400">{agent.hostname ?? ''}</span>
                  <span className="text-sm text-gray-400">{agent.os ?? ''}</span>
                  <span className="text-xs text-gray-400">Registered {new Date(agent.created_at).toLocaleString()}</span>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={async () => { await approveAgent(agent.id); reload(); }}>Approve</Button>
                  <Button size="sm" variant="destructive" onClick={async () => { await rejectAgent(agent.id); reload(); }}>Reject</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </Layout>
  );
}
