import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type SkillFile = { filename: string; description: string; content: string };

function buildSkillMd(name: string, description: string, content: string): string {
  return `---
name: ${name}
description: ${description}
---

${content}
`;
}

export async function writeSkills(
  baseDir: string,
  skills: { global: SkillFile[]; role: SkillFile[] },
): Promise<void> {
  const all = [...skills.global, ...skills.role];
  for (const skill of all) {
    const dir = join(baseDir, 'agent-nexus', skill.filename);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'SKILL.md'), buildSkillMd(skill.filename, skill.description, skill.content), 'utf-8');
  }
}

export async function writeSkillUpdate(
  baseDir: string,
  files: SkillFile[],
): Promise<void> {
  for (const skill of files) {
    const dir = join(baseDir, 'agent-nexus', skill.filename);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'SKILL.md'), buildSkillMd(skill.filename, skill.description, skill.content), 'utf-8');
  }
}
