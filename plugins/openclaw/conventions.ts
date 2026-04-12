import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function writeConventions(
  baseDir: string,
  conventions: { global: { filename: string; content: string }[]; role: { filename: string; content: string }[] },
): Promise<void> {
  const globalDir = join(baseDir, 'global');
  const roleDir = join(baseDir, 'role');
  await mkdir(globalDir, { recursive: true });
  await mkdir(roleDir, { recursive: true });

  for (const file of conventions.global) {
    await writeFile(join(globalDir, file.filename), file.content, 'utf-8');
  }
  for (const file of conventions.role) {
    await writeFile(join(roleDir, file.filename), file.content, 'utf-8');
  }
}

export async function writeConventionUpdate(
  baseDir: string,
  scope: 'global' | 'role',
  files: { filename: string; content: string }[],
): Promise<void> {
  const dir = join(baseDir, scope);
  await mkdir(dir, { recursive: true });
  for (const file of files) {
    await writeFile(join(dir, file.filename), file.content, 'utf-8');
  }
}
