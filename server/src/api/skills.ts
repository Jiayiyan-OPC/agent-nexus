import { Router, type IRouter } from 'express';
import { supabase } from '../db/supabase.js';
import { SKILL_SCOPES } from '@agent-nexus/protocol';
import type { SkillRow } from '@agent-nexus/protocol';

export const skillsRouter: IRouter = Router();

function parseYamlValue(key: string, fm: string): string | undefined {
  const re = new RegExp(`${key}:\\s*(.*)$`, 'm');
  const match = fm.match(re);
  if (!match) return undefined;
  const inline = match[1].trim();
  // Single-line value
  if (inline && inline !== '>' && inline !== '|') return inline;
  // Folded (>) or literal (|) block: collect indented continuation lines
  const lines = fm.split('\n');
  const idx = lines.findIndex(l => l.match(new RegExp(`^${key}:`)));
  if (idx === -1) return undefined;
  const parts: string[] = [];
  for (let i = idx + 1; i < lines.length; i++) {
    if (/^\s+/.test(lines[i])) {
      parts.push(lines[i].trim());
    } else {
      break;
    }
  }
  return parts.join(' ') || undefined;
}

function parseFrontmatter(content: string): { name?: string; description?: string } {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return {};
  const fm = match[1];
  return { name: parseYamlValue('name', fm), description: parseYamlValue('description', fm) };
}

// GET /api/skills — list all skills
skillsRouter.get('/', async (_req, res) => {
  const { data, error } = await supabase
    .from('skills')
    .select('*')
    .order('scope')
    .order('title');
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data as SkillRow[]);
});

// GET /api/skills/scope/:scope — list skills for a scope
skillsRouter.get('/scope/:scope', async (req, res) => {
  const scope = req.params.scope;
  if (!SKILL_SCOPES.includes(scope as any)) {
    res.status(400).json({ error: `Invalid scope: ${scope}` });
    return;
  }
  const { data, error } = await supabase
    .from('skills')
    .select('*')
    .eq('scope', scope)
    .order('title');
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data as SkillRow[]);
});

// GET /api/skills/:id — get single skill
skillsRouter.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('skills')
    .select('*')
    .eq('id', req.params.id)
    .single();
  if (error) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(data as SkillRow);
});

// POST /api/skills — create a skill
skillsRouter.post('/', async (req, res) => {
  const { scope, content } = req.body;
  if (!scope || !content) {
    res.status(400).json({ error: 'scope and content are required' });
    return;
  }
  if (!SKILL_SCOPES.includes(scope as any)) {
    res.status(400).json({ error: `Invalid scope: ${scope}` });
    return;
  }
  const { name, description } = parseFrontmatter(content);
  if (!name) {
    res.status(400).json({ error: 'Invalid SKILL.md: frontmatter must contain "name" field' });
    return;
  }
  const { data, error } = await supabase
    .from('skills')
    .insert({ scope, title: name, description: description ?? '', content })
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(201).json(data as SkillRow);
});

// PUT /api/skills/:id — update a skill
skillsRouter.put('/:id', async (req, res) => {
  const { scope, content } = req.body;
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (scope !== undefined) {
    if (!SKILL_SCOPES.includes(scope as any)) {
      res.status(400).json({ error: `Invalid scope: ${scope}` });
      return;
    }
    update.scope = scope;
  }
  if (content !== undefined) {
    const { name, description } = parseFrontmatter(content);
    if (!name) {
      res.status(400).json({ error: 'Invalid SKILL.md: frontmatter must contain "name" field' });
      return;
    }
    update.title = name;
    update.description = description ?? '';
    update.content = content;
  }

  const { data, error } = await supabase
    .from('skills')
    .update(update)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data as SkillRow);
});

// DELETE /api/skills/:id — delete a skill
skillsRouter.delete('/:id', async (req, res) => {
  const { error } = await supabase
    .from('skills')
    .delete()
    .eq('id', req.params.id);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ ok: true });
});
