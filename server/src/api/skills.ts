import { Router, type IRouter } from 'express';
import { supabase } from '../db/supabase.js';
import { SKILL_SCOPES } from '@agent-nexus/protocol';
import type { SkillRow } from '@agent-nexus/protocol';

export const skillsRouter: IRouter = Router();

// GET /api/skills — list all skills grouped by scope
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
  const { scope, title, description, content } = req.body;
  if (!scope || !title || !description || content === undefined) {
    res.status(400).json({ error: 'scope, title, description, and content are required' });
    return;
  }
  if (!SKILL_SCOPES.includes(scope as any)) {
    res.status(400).json({ error: `Invalid scope: ${scope}` });
    return;
  }
  const { data, error } = await supabase
    .from('skills')
    .insert({ scope, title, description, content })
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(201).json(data as SkillRow);
});

// PUT /api/skills/:id — update a skill
skillsRouter.put('/:id', async (req, res) => {
  const { scope, title, description, content } = req.body;
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (scope !== undefined) {
    if (!SKILL_SCOPES.includes(scope as any)) {
      res.status(400).json({ error: `Invalid scope: ${scope}` });
      return;
    }
    update.scope = scope;
  }
  if (title !== undefined) update.title = title;
  if (description !== undefined) update.description = description;
  if (content !== undefined) update.content = content;

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
