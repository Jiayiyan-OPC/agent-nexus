import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type SkillFile = { name: string; content: string };

export async function writeSkills(
  baseDir: string,
  skills: { global: SkillFile[]; role: SkillFile[] },
): Promise<{ written: number }> {
  const all = [...skills.global, ...skills.role];
  if (all.length === 0) {
    console.warn('[nexus] Server returned empty skills — nothing to write');
    return { written: 0 };
  }
  // Ensure the base skills directory exists before writing any skill
  await mkdir(baseDir, { recursive: true });
  for (const skill of all) {
    const dir = join(baseDir, `agent-nexus-${skill.name}`);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'SKILL.md'), skill.content, 'utf-8');
  }
  return { written: all.length };
}

export async function writeSkillUpdate(
  baseDir: string,
  files: SkillFile[],
): Promise<void> {
  await mkdir(baseDir, { recursive: true });
  for (const skill of files) {
    const dir = join(baseDir, `agent-nexus-${skill.name}`);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'SKILL.md'), skill.content, 'utf-8');
  }
}
