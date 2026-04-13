import { supabase } from '../db/supabase.js';
import type { SkillFiles } from '@agent-nexus/protocol';

export async function readSkillsByScope(scope: string): Promise<SkillFiles> {
  const { data, error } = await supabase
    .from('skills')
    .select('title, description, content')
    .eq('scope', scope)
    .order('title');
  if (error) throw error;
  return (data ?? []).map(row => ({ filename: row.title, description: row.description, content: row.content }));
}

export async function getSkillsForRole(role: string): Promise<{ global: SkillFiles; role: SkillFiles }> {
  const [global, roleFiles] = await Promise.all([
    readSkillsByScope('global'),
    readSkillsByScope(role),
  ]);
  return { global, role: roleFiles };
}
