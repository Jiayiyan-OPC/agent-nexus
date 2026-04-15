import { supabase } from '../db/supabase.js';
import type { SkillFiles } from '@agent-nexus/protocol';

export async function readSkillsByScope(scope: string): Promise<SkillFiles> {
  const { data, error } = await supabase
    .from('skills')
    .select('title, content')
    .eq('scope', scope);
  if (error) throw error;
  const files = (data ?? []).map(row => ({ name: row.title, content: row.content }));
  if (files.length === 0) {
    console.warn(`[skills] No skills found for scope "${scope}"`);
  }
  return files;
}

export async function getSkillsForRole(role: string): Promise<{ global: SkillFiles; role: SkillFiles }> {
  const results = await Promise.allSettled([
    readSkillsByScope('global'),
    readSkillsByScope(role),
  ]);

  const global = results[0].status === 'fulfilled' ? results[0].value : [];
  const roleFiles = results[1].status === 'fulfilled' ? results[1].value : [];

  if (results[0].status === 'rejected') {
    console.error(`[skills] Failed to read global skills:`, results[0].reason);
  }
  if (results[1].status === 'rejected') {
    console.error(`[skills] Failed to read skills for role "${role}":`, results[1].reason);
  }

  return { global, role: roleFiles };
}
