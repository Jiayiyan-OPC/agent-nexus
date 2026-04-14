import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type SkillFile = { name: string; content: string };

export async function writeSkills(
  baseDir: string,
  skills: { global: SkillFile[]; role: SkillFile[] },
): Promise<void> {
  const all = [...skills.global, ...skills.role];
  for (const skill of all) {
    const dir = join(baseDir, `agent-nexus-${skill.name}`);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'SKILL.md'), skill.content, 'utf-8');
  }
}

export async function writeSkillUpdate(
  baseDir: string,
  files: SkillFile[],
): Promise<void> {
  for (const skill of files) {
    const dir = join(baseDir, `agent-nexus-${skill.name}`);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'SKILL.md'), skill.content, 'utf-8');
  }
}
