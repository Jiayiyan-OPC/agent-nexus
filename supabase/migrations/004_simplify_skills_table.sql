-- Remove title and description columns from skills table
-- Content now contains the full SKILL.md with frontmatter (name, description)
ALTER TABLE skills DROP COLUMN IF EXISTS title;
ALTER TABLE skills DROP COLUMN IF EXISTS description;
