import { supabase } from '../db/supabase.js';
import type { SkillFiles } from '@agent-nexus/protocol';

function parseName(content: string): string {
  const match = content.match(/^---\s*\n[\s\S]*?name:\s*(.+)\n[\s\S]*?---/);
  return match?.[1]?.trim() ?? 'unnamed';
}

export async function readSkillsByScope(scope: string): Promise<SkillFiles> {
  const { data, error } = await supabase
    .from('skills')
    .select('content')
    .eq('scope', scope);
  if (error) throw error;
  return (data ?? []).map(row => ({ name: parseName(row.content), content: row.content }));
}

export async function getSkillsForRole(role: string): Promise<{ global: SkillFiles; role: SkillFiles }> {
  const [global, roleFiles] = await Promise.all([
    readSkillsByScope('global'),
    readSkillsByScope(role),
  ]);
  return { global, role: roleFiles };
}
