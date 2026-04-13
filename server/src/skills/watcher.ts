import { supabase } from '../db/supabase.js';
import { readSkillsByScope } from './reader.js';
import type { SkillFiles } from '@agent-nexus/protocol';

export type SkillChangeHandler = (event: {
  scope: 'global' | 'role';
  role?: string;
  files: SkillFiles;
}) => void;

export function watchSkills(onChange: SkillChangeHandler): void {
  supabase
    .channel('skills-changes')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'skills',
    }, async (payload) => {
      try {
        const row = (payload.new as any) || (payload.old as any);
        if (!row?.scope) return;

        const scope = row.scope as string;
        const files = await readSkillsByScope(scope);

        if (scope === 'global') {
          onChange({ scope: 'global', files });
        } else {
          onChange({ scope: 'role', role: scope, files });
        }
      } catch (err) {
        console.error('[skills] Watcher error:', err);
      }
    })
    .subscribe();
}
