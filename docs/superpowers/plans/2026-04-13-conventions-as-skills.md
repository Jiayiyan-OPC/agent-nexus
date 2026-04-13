# Conventions as OpenClaw Skills — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the OpenClaw plugin's convention handling so conventions are written as OpenClaw Skill files (`SKILL.md`), enabling automatic model context injection via OpenClaw's skill watcher.

**Architecture:** Replace the flat-file convention writer with a skill-file generator that merges multiple convention files per scope into a single `SKILL.md` with YAML frontmatter. The plugin's `index.ts` updates the base directory path; message handling logic stays the same.

**Tech Stack:** TypeScript, Node.js fs API

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `plugins/openclaw/conventions.ts` | Rewrite | Generate SKILL.md files from convention payloads |
| `plugins/openclaw/index.ts` | Modify | Update `conventionsDir` path, update `writeConventionUpdate` call signature for role |

---

### Task 1: Rewrite `conventions.ts` — skill file generator

**Files:**
- Modify: `plugins/openclaw/conventions.ts` (full rewrite, 31 lines → ~45 lines)

- [ ] **Step 1: Rewrite `conventions.ts` with skill-file generation logic**

Replace the entire content of `plugins/openclaw/conventions.ts` with:

```typescript
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type ConventionFile = { filename: string; content: string };

function buildSkillMd(name: string, description: string, files: ConventionFile[]): string {
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

export async function writeConventions(
  baseDir: string,
  role: string,
  conventions: { global: ConventionFile[]; role: ConventionFile[] },
): Promise<void> {
  if (conventions.global.length > 0) {
    const dir = join(baseDir, 'nexus-conventions-global');
    await mkdir(dir, { recursive: true });
    const content = buildSkillMd(
      'nexus_conventions_global',
      'Team-wide conventions synced from Agent Nexus. All roles must follow.',
      conventions.global,
    );
    await writeFile(join(dir, 'SKILL.md'), content, 'utf-8');
  }

  if (conventions.role.length > 0) {
    const dir = join(baseDir, `nexus-conventions-${role}`);
    await mkdir(dir, { recursive: true });
    const content = buildSkillMd(
      `nexus_conventions_${role}`,
      `Role-specific conventions for ${role}, synced from Agent Nexus.`,
      conventions.role,
    );
    await writeFile(join(dir, 'SKILL.md'), content, 'utf-8');
  }
}

export async function writeConventionUpdate(
  baseDir: string,
  scope: string,
  role: string,
  files: ConventionFile[],
): Promise<void> {
  const dirName = scope === 'global' ? 'nexus-conventions-global' : `nexus-conventions-${role}`;
  const name = scope === 'global' ? 'nexus_conventions_global' : `nexus_conventions_${role}`;
  const description =
    scope === 'global'
      ? 'Team-wide conventions synced from Agent Nexus. All roles must follow.'
      : `Role-specific conventions for ${role}, synced from Agent Nexus.`;

  const dir = join(baseDir, dirName);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'SKILL.md'), buildSkillMd(name, description, files), 'utf-8');
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /Users/yanjiayi/workspace/agent-nexus/plugins/openclaw && npx tsc --noEmit conventions.ts`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add plugins/openclaw/conventions.ts
git commit -m "refactor: rewrite conventions writer to generate OpenClaw SKILL.md files"
```

---

### Task 2: Update `index.ts` — new path and call signatures

**Files:**
- Modify: `plugins/openclaw/index.ts` (3 targeted edits)

- [ ] **Step 1: Change `conventionsDir` to OpenClaw workspace skills path**

In `index.ts`, change line 27:

```typescript
// Before
const conventionsDir = join(dataDir, 'conventions');

// After
const conventionsDir = api.resolvePath('~/.openclaw/workspace/skills');
```

- [ ] **Step 2: Update `writeConventions` calls to pass `role`**

The new `writeConventions` signature requires `role` as the second argument. There are two call sites.

In the `auth.ok` handler (line 54), change:

```typescript
// Before
writeConventions(conventionsDir, msg.payload.conventions).catch(() => {});

// After
writeConventions(conventionsDir, config.role, msg.payload.conventions).catch(() => {});
```

In the `register.approved` handler (line 75), change:

```typescript
// Before
writeConventions(conventionsDir, msg.payload.conventions).catch(() => {});

// After
writeConventions(conventionsDir, config.role, msg.payload.conventions).catch(() => {});
```

- [ ] **Step 3: Update `writeConventionUpdate` call to pass `role`**

In the `conventions.update` handler (line 83), change:

```typescript
// Before
writeConventionUpdate(conventionsDir, msg.payload.scope, msg.payload.files).catch(() => {});

// After
writeConventionUpdate(conventionsDir, msg.payload.scope, config.role, msg.payload.files).catch(() => {});
```

- [ ] **Step 4: Verify the file compiles**

Run: `cd /Users/yanjiayi/workspace/agent-nexus/plugins/openclaw && npx tsc --noEmit index.ts`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add plugins/openclaw/index.ts
git commit -m "feat: write conventions as OpenClaw skills to ~/.openclaw/workspace/skills/"
```
