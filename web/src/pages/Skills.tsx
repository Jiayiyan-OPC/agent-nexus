import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { fetchSkills, createSkill, updateSkill, deleteSkill } from '../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import type { SkillRow } from '@agent-nexus/protocol';
import { SKILL_SCOPES } from '@agent-nexus/protocol';

const scopeColors: Record<string, string> = {
  global: 'bg-gray-100 text-gray-800',
  arch: 'bg-purple-100 text-purple-800',
  pmo: 'bg-blue-100 text-blue-800',
  dev: 'bg-emerald-100 text-emerald-800',
  qa: 'bg-amber-100 text-amber-800',
  devops: 'bg-orange-100 text-orange-800',
};

export default function Skills() {
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<SkillRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [filterScope, setFilterScope] = useState<string>('all');

  // Form state
  const [formScope, setFormScope] = useState('global');
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formContent, setFormContent] = useState('');

  const load = async () => {
    const data = await fetchSkills();
    setSkills(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = filterScope === 'all'
    ? skills
    : skills.filter(s => s.scope === filterScope);

  const startCreate = () => {
    setEditing(null);
    setCreating(true);
    setFormScope('global');
    setFormTitle('');
    setFormDescription('');
    setFormContent('');
  };

  const startEdit = (s: SkillRow) => {
    setCreating(false);
    setEditing(s);
    setFormScope(s.scope);
    setFormTitle(s.title);
    setFormDescription(s.description);
    setFormContent(s.content);
  };

  const cancelForm = () => {
    setEditing(null);
    setCreating(false);
  };

  const handleSave = async () => {
    if (creating) {
      await createSkill({ scope: formScope, title: formTitle, description: formDescription, content: formContent });
    } else if (editing) {
      await updateSkill(editing.id, { scope: formScope, title: formTitle, description: formDescription, content: formContent });
    }
    cancelForm();
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this skill?')) return;
    await deleteSkill(id);
    load();
  };

  const isFormOpen = creating || editing !== null;

  return (
    <Layout>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Skills</h1>
        <Button size="sm" onClick={startCreate}>New Skill</Button>
      </div>

      {/* Scope filter */}
      <div className="flex gap-2 mb-4">
        <Button size="sm" variant={filterScope === 'all' ? 'default' : 'outline'} onClick={() => setFilterScope('all')}>
          All ({skills.length})
        </Button>
        {SKILL_SCOPES.map(s => {
          const count = skills.filter(sk => sk.scope === s).length;
          return (
            <Button key={s} size="sm" variant={filterScope === s ? 'default' : 'outline'} onClick={() => setFilterScope(s)}>
              {s} ({count})
            </Button>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* List */}
        <div className={isFormOpen ? 'col-span-1' : 'col-span-3'}>
          {loading ? (
            <p className="text-gray-500">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="text-gray-500">No skills</p>
          ) : (
            <div className="space-y-2">
              {filtered.map(s => (
                <Card
                  key={s.id}
                  className={`cursor-pointer transition-shadow hover:shadow-md ${editing?.id === s.id ? 'ring-2 ring-primary' : ''}`}
                  onClick={() => startEdit(s)}
                >
                  <CardContent className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary" className={scopeColors[s.scope] ?? ''}>
                        {s.scope}
                      </Badge>
                      <div>
                        <span className="font-medium">{s.title}</span>
                        <p className="text-xs text-gray-500">{s.description}</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-500 hover:text-red-700"
                      onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
                    >
                      Delete
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Editor */}
        {isFormOpen && (
          <div className="col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>{creating ? 'New Skill' : 'Edit Skill'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="scope">Scope</Label>
                    <select
                      id="scope"
                      value={formScope}
                      onChange={e => setFormScope(e.target.value)}
                      className="h-9 w-full rounded-md border px-3 text-sm"
                    >
                      {SKILL_SCOPES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="title">Title</Label>
                    <Input id="title" value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="e.g. code-style" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="description">Description</Label>
                  <Input id="description" value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="One-line description for skill discovery" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="content">Content (Markdown)</Label>
                  <textarea
                    id="content"
                    value={formContent}
                    onChange={e => setFormContent(e.target.value)}
                    className="w-full h-80 rounded-md border px-3 py-2 text-sm font-mono resize-y"
                    placeholder="Write your skill content here..."
                  />
                </div>
                <Separator />
                <div className="flex gap-2">
                  <Button onClick={handleSave} disabled={!formTitle || !formDescription || !formContent}>Save</Button>
                  <Button variant="outline" onClick={cancelForm}>Cancel</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </Layout>
  );
}
