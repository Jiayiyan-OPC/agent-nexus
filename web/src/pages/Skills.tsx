import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { fetchSkills, createSkill, updateSkill, deleteSkill } from '../lib/api';
import { Button } from '@/components/ui/button';
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

const SKILL_TEMPLATE = `---
name: my-skill
description: One-line description for skill discovery
---

# Skill Title

Your skill content here...
`;

export default function Skills() {
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<SkillRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [filterScope, setFilterScope] = useState<string>('all');

  // Form state
  const [formScope, setFormScope] = useState('global');
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
    setFormContent(SKILL_TEMPLATE);
  };

  const startEdit = (s: SkillRow) => {
    setCreating(false);
    setEditing(s);
    setFormScope(s.scope);
    setFormContent(s.content);
  };

  const cancelForm = () => {
    setEditing(null);
    setCreating(false);
  };

  const handleSave = async () => {
    if (creating) {
      await createSkill({ scope: formScope, content: formContent });
    } else if (editing) {
      await updateSkill(editing.id, { scope: formScope, content: formContent });
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
                  <Label htmlFor="content">SKILL.md</Label>
                  <textarea
                    id="content"
                    value={formContent}
                    onChange={e => setFormContent(e.target.value)}
                    className="w-full h-96 rounded-md border px-3 py-2 text-sm font-mono resize-y"
                    placeholder="---&#10;name: my-skill&#10;description: ...&#10;---&#10;&#10;# Content"
                  />
                </div>
                <Separator />
                <div className="flex gap-2">
                  <Button onClick={handleSave} disabled={!formContent.trim()}>Save</Button>
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
