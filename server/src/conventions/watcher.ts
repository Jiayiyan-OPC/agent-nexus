import { watch } from 'chokidar';
import { relative, sep } from 'node:path';
import { getConventionsDir, readConventionDir } from './reader.js';
import type { ConventionFiles } from '@agent-nexus/protocol';

export type ConventionChangeHandler = (event: {
  scope: 'global' | 'role';
  role?: string;
  files: ConventionFiles;
}) => void;

export function watchConventions(onChange: ConventionChangeHandler): void {
  const dir = getConventionsDir();

  const watcher = watch(dir, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 300 },
  });

  const handleChange = async (filePath: string) => {
    const rel = relative(dir, filePath);
    const parts = rel.split(sep);
    if (parts.length < 2) return;

    const subdir = parts[0];
    if (!filePath.endsWith('.md')) return;

    if (subdir === 'global') {
      const files = await readConventionDir('global');
      onChange({ scope: 'global', files });
    } else {
      const files = await readConventionDir(subdir);
      onChange({ scope: 'role', role: subdir, files });
    }
  };

  watcher.on('add', handleChange);
  watcher.on('change', handleChange);
  watcher.on('unlink', handleChange);
}
