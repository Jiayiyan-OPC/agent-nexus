import { mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const SKILL_DIR_PREFIX = 'agent-nexus-';

type SkillFile = { name: string; content: string };

/**
 * Remove agent-nexus-* directories that are not in the current skill set.
 * Only touches directories with the agent-nexus- prefix; leaves other skills untouched.
 */
export async function clearStaleSkills(baseDir: string, currentNames: string[]): Promise<string[]> {
  const kept = new Set(currentNames.map(n => `${SKILL_DIR_PREFIX}${n}`));
  let entries: string[];
  try {
    entries = await readdir(baseDir);
  } catch {
    return []; // baseDir doesn't exist yet — nothing to clean
  }
  const removed: string[] = [];
  for (const entry of entries) {
    if (entry.startsWith(SKILL_DIR_PREFIX) && !kept.has(entry)) {
      await rm(join(baseDir, entry), { recursive: true, force: true });
      removed.push(entry);
    }
  }
  return removed;
}

export async function writeSkills(
  baseDir: string,
  skills: { global: SkillFile[]; role: SkillFile[] },
): Promise<{ written: number }> {
  const all = [...skills.global, ...skills.role];
  if (all.length === 0) {
    return { written: 0 };
  }
  // Ensure the base skills directory exists before writing any skill
  await mkdir(baseDir, { recursive: true });
  // Clear stale skills that are no longer in the current set
  await clearStaleSkills(baseDir, all.map(s => s.name));
  for (const skill of all) {
    const dir = join(baseDir, `${SKILL_DIR_PREFIX}${skill.name}`);
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
    const dir = join(baseDir, `${SKILL_DIR_PREFIX}${skill.name}`);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'SKILL.md'), skill.content, 'utf-8');
  }
}
