const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:9000';
const TOKEN_KEY = 'agent-nexus-token';

async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem(TOKEN_KEY);
  return fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
}

export async function fetchAgents(status?: string) {
  const query = status ? `?status=${status}` : '';
  const res = await authFetch(`/api/agents${query}`);
  return res.json();
}

export async function fetchAgent(id: string) {
  const res = await authFetch(`/api/agents/${id}`);
  return res.json();
}

export async function approveAgent(id: string) {
  const res = await authFetch(`/api/agents/${id}/approve`, { method: 'POST' });
  return res.json();
}

export async function rejectAgent(id: string, reason?: string) {
  const res = await authFetch(`/api/agents/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
  return res.json();
}

export async function updateAgent(id: string, fields: { name?: string; role?: string }) {
  const res = await authFetch(`/api/agents/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(fields),
  });
  return res.json();
}

export async function revokeAgent(id: string) {
  const res = await authFetch(`/api/agents/${id}`, { method: 'DELETE' });
  return res.json();
}

export async function fetchSessions(agentId: string, limit = 20, offset = 0) {
  const res = await authFetch(`/api/status/sessions/${agentId}?limit=${limit}&offset=${offset}`);
  return res.json();
}

// --- Skills ---

export async function fetchSkills() {
  const res = await authFetch('/api/skills');
  return res.json();
}

export async function fetchSkill(id: string) {
  const res = await authFetch(`/api/skills/${id}`);
  return res.json();
}

export async function createSkill(data: { scope: string; title: string; description: string; content: string }) {
  const res = await authFetch('/api/skills', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateSkill(id: string, data: { scope?: string; title?: string; description?: string; content?: string }) {
  const res = await authFetch(`/api/skills/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteSkill(id: string) {
  const res = await authFetch(`/api/skills/${id}`, { method: 'DELETE' });
  return res.json();
}
