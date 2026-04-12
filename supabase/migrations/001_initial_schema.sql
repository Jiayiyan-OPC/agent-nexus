-- Users table (OAuth only, no passwords)
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider      TEXT NOT NULL,        -- "google" | "microsoft"
  provider_id   TEXT NOT NULL,        -- OAuth sub (third-party unique ID)
  email         TEXT,
  name          TEXT,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_id)
);

-- Agents table
CREATE TABLE agents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key       TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  agent_type    TEXT NOT NULL CHECK (agent_type IN ('hermes', 'openclaw')),
  role          TEXT NOT NULL CHECK (role IN ('arch', 'pmo', 'dev', 'qa', 'devops')),
  status        TEXT NOT NULL DEFAULT 'pending_approval'
                CHECK (status IN ('pending_approval', 'active', 'rejected', 'revoked')),
  mac_address   TEXT,
  hostname      TEXT,
  os            TEXT,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Agent status (aggregated view)
CREATE TABLE agent_status (
  agent_id          UUID PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'offline'
                    CHECK (status IN ('online', 'offline', 'error')),
  active_sessions   INTEGER NOT NULL DEFAULT 0,
  total_token_used  INTEGER NOT NULL DEFAULT 0,
  session_start     TIMESTAMPTZ,
  last_heartbeat    TIMESTAMPTZ,
  error_message     TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Agent sessions
CREATE TABLE agent_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  task_name     TEXT,
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'completed', 'error')),
  token_used    INTEGER NOT NULL DEFAULT 0,
  token_limit   INTEGER,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at      TIMESTAMPTZ,
  metadata      JSONB
);

CREATE INDEX idx_agent_sessions_agent_id ON agent_sessions(agent_id);
CREATE INDEX idx_agent_sessions_status ON agent_sessions(status);

-- Auto-create agent_status row when agent is inserted
CREATE OR REPLACE FUNCTION create_agent_status()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO agent_status (agent_id, updated_at) VALUES (NEW.id, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_create_agent_status
  AFTER INSERT ON agents
  FOR EACH ROW EXECUTE FUNCTION create_agent_status();

-- RLS: enable on all tables
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;

-- RLS policies: authenticated users (admin) get full access
CREATE POLICY "Authenticated users have full access to agents"
  ON agents FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users have full access to agent_status"
  ON agent_status FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users have full access to agent_sessions"
  ON agent_sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Enable Realtime on status tables
ALTER PUBLICATION supabase_realtime ADD TABLE agents;
ALTER PUBLICATION supabase_realtime ADD TABLE agent_status;
ALTER PUBLICATION supabase_realtime ADD TABLE agent_sessions;

-- RPC: increment active_sessions
CREATE OR REPLACE FUNCTION increment_active_sessions(p_agent_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE agent_status
  SET active_sessions = active_sessions + 1
  WHERE agent_id = p_agent_id;
END;
$$ LANGUAGE plpgsql;

-- RPC: decrement active_sessions and add token usage
CREATE OR REPLACE FUNCTION decrement_active_sessions(p_agent_id UUID, p_token_used INTEGER)
RETURNS void AS $$
BEGIN
  UPDATE agent_status
  SET active_sessions = GREATEST(active_sessions - 1, 0),
      total_token_used = total_token_used + p_token_used
  WHERE agent_id = p_agent_id;
END;
$$ LANGUAGE plpgsql;
