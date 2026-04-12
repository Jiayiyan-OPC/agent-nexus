import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ConventionFiles } from '@agent-nexus/protocol';

const CONVENTIONS_DIR = join(import.meta.dirname, '../../conventions');

export function getConventionsDir(): string {
  return CONVENTIONS_DIR;
}

export async function readConventionDir(subdir: string): Promise<ConventionFiles> {
  const dir = join(CONVENTIONS_DIR, subdir);
  try {
    const files = await readdir(dir);
    const results: ConventionFiles = [];
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const content = await readFile(join(dir, file), 'utf-8');
      results.push({ filename: file, content });
    }
    return results;
  } catch {
    return [];
  }
}

export async function getConventionsForRole(role: string): Promise<{ global: ConventionFiles; role: ConventionFiles }> {
  const [global, roleFiles] = await Promise.all([
    readConventionDir('global'),
    readConventionDir(role),
  ]);
  return { global, role: roleFiles };
}
