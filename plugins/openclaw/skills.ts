import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type SkillFile = { filename: string; description: string; content: string };

function buildSkillMd(name: string, description: string, files: SkillFile[]): string {
  const sections = files
    .map((f) => `## ${f.filename}\n\n${f.content}`)
    .join('\n\n');

  return `---
name: ${name}
description: ${description}
---

${sections}
`;
}

function scopeDescription(scope: string, files: SkillFile[]): string {
  if (files.length === 1) return files[0].description;
  return `Agent Nexus ${scope} skills`;
}

export async function writeSkills(
  baseDir: string,
  role: string,
  skills: { global: SkillFile[]; role: SkillFile[] },
): Promise<void> {
  if (skills.global.length > 0) {
    const dir = join(baseDir, 'agent-nexus-global');
    await mkdir(dir, { recursive: true });
    const content = buildSkillMd(
      'agent-nexus-global',
      scopeDescription('global', skills.global),
      skills.global,
    );
    await writeFile(join(dir, 'SKILL.md'), content, 'utf-8');
  }

  if (skills.role.length > 0) {
    const dir = join(baseDir, `agent-nexus-${role}`);
    await mkdir(dir, { recursive: true });
    const content = buildSkillMd(
      `agent-nexus-${role}`,
      scopeDescription(role, skills.role),
      skills.role,
    );
    await writeFile(join(dir, 'SKILL.md'), content, 'utf-8');
  }
}

export async function writeSkillUpdate(
  baseDir: string,
  scope: string,
  role: string,
  files: SkillFile[],
): Promise<void> {
  const dirName = scope === 'global' ? 'agent-nexus-global' : `agent-nexus-${role}`;
  const name = scope === 'global' ? 'agent-nexus-global' : `agent-nexus-${role}`;

  const dir = join(baseDir, dirName);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'SKILL.md'), buildSkillMd(name, scopeDescription(scope === 'global' ? 'global' : role, files), files), 'utf-8');
}
