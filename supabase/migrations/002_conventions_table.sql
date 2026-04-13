-- Conventions table (replaces file-based conventions)
CREATE TABLE conventions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope      TEXT NOT NULL CHECK (scope IN ('global', 'arch', 'pmo', 'dev', 'qa', 'devops')),
  title      TEXT NOT NULL,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_conventions_scope ON conventions(scope);

-- RLS
ALTER TABLE conventions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon read access to conventions"
  ON conventions FOR SELECT TO anon USING (true);

CREATE POLICY "Authenticated users have full access to conventions"
  ON conventions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE conventions;
