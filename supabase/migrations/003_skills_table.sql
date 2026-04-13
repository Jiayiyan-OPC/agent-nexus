-- Skills table (replaces conventions)
CREATE TABLE skills (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope      TEXT NOT NULL CHECK (scope IN ('global', 'arch', 'pmo', 'dev', 'qa', 'devops')),
  title      TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_skills_scope ON skills(scope);

-- RLS
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon read access to skills"
  ON skills FOR SELECT TO anon USING (true);

CREATE POLICY "Authenticated users have full access to skills"
  ON skills FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE skills;
