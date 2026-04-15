-- Agent Events table (Cross-Agent Event Bus data layer)
CREATE TABLE agent_events (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id           UUID NOT NULL,
  correlation_id     UUID,
  thread_id          UUID,
  event_type         TEXT NOT NULL,
  source_agent_id    UUID REFERENCES agents(id) ON DELETE SET NULL,
  target_agent_id    UUID REFERENCES agents(id) ON DELETE SET NULL,
  source_context     JSONB,
  payload            JSONB NOT NULL,
  state              TEXT NOT NULL CHECK (state IN ('received', 'delivered', 'rejected')),
  error_message      TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for efficient querying
CREATE UNIQUE INDEX agent_events_event_id_idx ON agent_events (event_id);
CREATE INDEX agent_events_target_created_idx ON agent_events (target_agent_id, created_at DESC);
CREATE INDEX agent_events_source_created_idx ON agent_events (source_agent_id, created_at DESC);

-- RLS
ALTER TABLE agent_events ENABLE ROW LEVEL SECURITY;

-- Authenticated (admin dashboard) can read
CREATE POLICY "Authenticated read access to agent_events"
  ON agent_events FOR SELECT TO authenticated USING (true);

-- Service role has full access (server writes via service_role key)
-- Note: service_role bypasses RLS by default in Supabase, no explicit policy needed.

-- Anonymous has no access (no policy = deny)

-- Enable Realtime for event delivery notifications
ALTER PUBLICATION supabase_realtime ADD TABLE agent_events;
