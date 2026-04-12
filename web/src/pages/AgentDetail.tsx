import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import Layout from '../components/Layout';
import StatusBadge from '../components/StatusBadge';
import RoleBadge from '../components/RoleBadge';
import SessionList from '../components/SessionList';
import { useAgentSessions } from '../hooks/useAgents';
import { fetchAgent, updateAgent, revokeAgent } from '../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ROLES } from '@agent-nexus/protocol';

export default function AgentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [agent, setAgent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState('');
  const { sessions, loading: sessionsLoading } = useAgentSessions(id!);

  useEffect(() => {
    fetchAgent(id!).then(data => {
      setAgent(data);
      setEditName(data.name);
      setEditRole(data.role);
      setLoading(false);
    });
  }, [id]);

  if (loading) return <Layout><p>Loading...</p></Layout>;
  if (!agent) return <Layout><p>Agent not found</p></Layout>;

  const handleSave = async () => {
    const updated = await updateAgent(id!, { name: editName, role: editRole });
    setAgent({ ...agent, ...updated });
  };

  const handleRevoke = async () => {
    if (!confirm('Revoke this agent? This will invalidate its API key.')) return;
    await revokeAgent(id!);
    navigate('/');
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">{agent.name}</h1>
            <RoleBadge role={agent.role} />
            <StatusBadge status={agent.online_status?.status ?? 'offline'} />
          </div>
          <Button variant="destructive" size="sm" onClick={handleRevoke}>Revoke</Button>
        </div>

        <Card>
          <CardHeader><CardTitle>Agent Info</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-500">Type:</span> {agent.agent_type}</div>
              <div><span className="text-gray-500">Status:</span> {agent.status}</div>
              <div><span className="text-gray-500">Hostname:</span> {agent.hostname ?? '—'}</div>
              <div><span className="text-gray-500">OS:</span> {agent.os ?? '—'}</div>
              <div><span className="text-gray-500">Created:</span> {new Date(agent.created_at).toLocaleString()}</div>
              <div><span className="text-gray-500">Active sessions:</span> {agent.online_status?.active_sessions ?? 0}</div>
              <div><span className="text-gray-500">Total tokens:</span> {(agent.online_status?.total_token_used ?? 0).toLocaleString()}</div>
            </div>
            <Separator />
            <div className="flex items-end gap-4">
              <div className="space-y-1">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={editName} onChange={e => setEditName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="role">Role</Label>
                <select id="role" value={editRole} onChange={e => setEditRole(e.target.value)} className="h-9 rounded-md border px-3 text-sm">
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <Button onClick={handleSave}>Save</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Sessions</CardTitle></CardHeader>
          <CardContent>
            {sessionsLoading ? <p className="text-gray-500">Loading...</p> : <SessionList sessions={sessions} />}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
