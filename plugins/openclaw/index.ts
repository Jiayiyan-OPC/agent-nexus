import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { hostname, platform, release } from 'node:os';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import { NexusWsClient, type WsMessage } from './ws-client.js';
import { writeSkills, writeSkillUpdate } from './skills.js';

async function fetchSkillsViaRest(
  serverUrl: string,
  apiKey: string,
  role: string,
): Promise<{ global: { name: string; content: string }[]; role: { name: string; content: string }[] } | null> {
  try {
    // Convert ws(s):// to http(s)://
    const httpUrl = serverUrl.replace(/^ws(s)?:\/\//, 'http$1://');
    const res = await fetch(`${httpUrl}/api/skills`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    const rows: { scope: string; title: string; content: string }[] = await res.json();
    const global = rows.filter(r => r.scope === 'global').map(r => ({ name: r.title, content: r.content }));
    const roleFiles = rows.filter(r => r.scope === role).map(r => ({ name: r.title, content: r.content }));
    return { global, role: roleFiles };
  } catch {
    return null;
  }
}

type PluginConfig = {
  serverUrl?: string;
  agentName?: string;
  role?: string;
};

type PersistedState = {
  apiKey?: string;
  agentId?: string;
  serverUrl?: string;
  agentName?: string;
  role?: string;
};

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
  });
}

export default {
  id: 'agent-nexus',
  name: 'Agent Nexus',
  description: 'Connect to Agent Nexus for identity management, skill distribution, and session tracking',

  register(api: any) {
    const log = api.logger;
    const pluginConfig = api.pluginConfig as PluginConfig | undefined;
    const ocAgentNames: string[] = (api.config?.agents?.list ?? [])
      .map((a: any) => a.identity?.name)
      .filter(Boolean);

    const dataDir = api.resolvePath('~/.openclaw/extensions/agent-nexus');
    const stateFile = join(dataDir, 'state.json');
    const skillsDir = api.resolvePath('~/.openclaw/workspace/skills');

    let state: PersistedState = {};

    async function writeSkillsWithFallback(
      skills: { global: { name: string; content: string }[]; role: { name: string; content: string }[] },
    ): Promise<void> {
      const { written } = await writeSkills(skillsDir, skills);
      if (written > 0 || !state.apiKey) return;
      log.info('[nexus] No skills from WS, trying REST fallback...');
      const cfg = resolveConfig();
      const fallback = await fetchSkillsViaRest(cfg.serverUrl, state.apiKey, cfg.role);
      if (!fallback) {
        log.warn('[nexus] REST fallback failed');
        return;
      }
      const { written: fbWritten } = await writeSkills(skillsDir, fallback);
      if (fbWritten > 0) log.info(`[nexus] REST fallback delivered ${fbWritten} skill(s)`);
      else log.warn('[nexus] REST fallback also returned no skills — is the skills table empty?');
    }

    // Single shared client — worker runs in separate thread
    const client = new NexusWsClient({
      onMessage(msg: WsMessage) {
        switch (msg.type) {
          case 'auth.ok':
            log.info(`[nexus] Authenticated as ${msg.payload.name} (${msg.payload.role})`);
            writeSkillsWithFallback(msg.payload.skills)
              .catch((err) => log.error(`[nexus] Failed to write skills: ${err}`));
            break;
          case 'auth.fail':
            log.warn(`[nexus] Auth failed: ${msg.payload.reason}`);
            state.apiKey = undefined;
            saveState().catch(() => {});
            break;
          case 'register.pending':
            state.agentId = msg.payload.agentId;
            saveState().catch(() => {});
            log.info(`[nexus] Registration pending approval (agentId: ${msg.payload.agentId})`);
            break;
          case 'register.approved':
            state.apiKey = msg.payload.apiKey;
            state.agentId = msg.payload.agentId;
            saveState().catch(() => {});
            log.info(`[nexus] Approved! Connected as ${msg.payload.name} (${msg.payload.role})`);
            writeSkillsWithFallback(msg.payload.skills)
              .catch((err) => log.error(`[nexus] Failed to write skills: ${err}`));
            break;
          case 'register.rejected':
            log.warn(`[nexus] Registration rejected: ${msg.payload.reason}`);
            break;
          case 'skills.update':
            writeSkillUpdate(skillsDir, msg.payload.files).catch((err) => log.error(`[nexus] Failed to write skill update: ${err}`));
            log.info(`[nexus] Skills updated (${msg.payload.scope})`);
            break;
          case 'heartbeat.ack':
            break;
          case 'error':
            log.warn(`[nexus] Server error: ${msg.payload.reason}`);
            break;
          case 'event.deliver':
            handleEventDeliver(msg.payload, log, api).catch((err) =>
              log.error(`[nexus] Failed to handle event.deliver: ${err}`),
            );
            break;
          case 'event.ack':
            log.info(`[nexus] Event ${msg.payload.eventId}: ${msg.payload.status}${msg.payload.reason ? ` (${msg.payload.reason})` : ''}`);
            break;
        }
      },
      logger: log,
    });

    async function loadState(): Promise<void> {
      try {
        const raw = await readFile(stateFile, 'utf-8');
        state = JSON.parse(raw);
      } catch {
        state = {};
      }
    }

    async function saveState(): Promise<void> {
      await mkdir(dataDir, { recursive: true });
      await writeFile(stateFile, JSON.stringify(state, null, 2), 'utf-8');
    }

    function resolveConfig(): { serverUrl: string; agentName: string; role: string } {
      return {
        serverUrl: pluginConfig?.serverUrl || state.serverUrl || 'wss://api.agent-nexus.1702.store',
        agentName: pluginConfig?.agentName || state.agentName || ocAgentNames[0] || hostname(),
        role: pluginConfig?.role || state.role || '',
      };
    }

    function buildAuthMsg(cfg: { serverUrl: string; agentName: string; role: string }) {
      if (state.apiKey) {
        return { type: 'auth', payload: { apiKey: state.apiKey, hostname: hostname(), os: `${platform()} ${release()}` } };
      }
      return { type: 'register', payload: { name: cfg.agentName, agentType: 'openclaw', role: cfg.role, hostname: hostname(), os: `${platform()} ${release()}` } };
    }

    // --- nexus.send_event tool ---
    // Note: @sinclair/typebox is provided by the OpenClaw Plugin host runtime

    interface SendEventParams {
      targetAgentId: string;
      content: string;
      url?: string;
      eventType?: string;
      correlationId?: string;
    }

    interface ToolContext {
      sessionId?: string;
      channel?: string;
      groupId?: string;
    }

    try {
      const { Type } = await import('@sinclair/typebox');
      api.registerTool({
        name: 'nexus_send_event',
        description: 'Send an event to another agent via Agent Nexus Event Bus. Fire-and-forget: returns eventId immediately.',
        parameters: Type.Object({
          targetAgentId: Type.String({ description: 'Target agent ID (UUID)' }),
          content: Type.String({ description: 'Event content (text/markdown)' }),
          url: Type.Optional(Type.String({ description: 'Optional URL reference' })),
          eventType: Type.Optional(Type.String({ description: 'Event type (default: "task")' })),
          correlationId: Type.Optional(Type.String({ description: 'Optional correlation ID for tracking' })),
        }),
        async execute(_id: string, params: SendEventParams, ctx: ToolContext) {
          if (!client.connected || !state.apiKey) {
            return { content: [{ type: 'text', text: 'Error: Not connected to Agent Nexus.' }] };
          }
          const eventId = randomUUID();
          client.send({
            type: 'event.send',
            payload: {
              eventId,
              correlationId: params.correlationId,
              eventType: params.eventType || 'task',
              targetAgentId: params.targetAgentId,
              content: params.content,
              url: params.url,
              sourceContext: {
                sessionId: ctx?.sessionId ?? 'unknown',
                channel: ctx?.channel ?? 'unknown',
                groupId: ctx?.groupId,
              },
              payload: {},
            },
          });
          return { content: [{ type: 'text', text: `Event sent. eventId: ${eventId}` }] };
        },
      }, { optional: true });
    } catch {
      log.warn('[nexus] Could not register nexus_send_event tool (typebox not available)');
    }

    // --- CLI ---

    api.registerCli(({ program }: any) => {
      const nexus = program.command('nexus').description('Agent Nexus management');

      nexus
        .command('setup')
        .description('Configure Agent Nexus connection')
        .action(async () => {
          await loadState();

          if (state.apiKey) {
            console.log(`Already registered and approved. API key: ${state.apiKey.slice(0, 10)}...`);
            console.log('To re-register, delete state file and run setup again.');
            return;
          }

          // --- Interactive: Agent Name ---
          let setupName = '';
          if (ocAgentNames.length > 0) {
            console.log('\nAvailable agents:');
            ocAgentNames.forEach((n, i) => console.log(`  ${i + 1}) ${n}`));
            console.log(`  ${ocAgentNames.length + 1}) Enter a custom name`);
            const choice = await prompt(`\nSelect agent [1]: `);
            const idx = parseInt(choice || '1', 10) - 1;
            if (idx >= 0 && idx < ocAgentNames.length) {
              setupName = ocAgentNames[idx];
            } else {
              setupName = await prompt('Agent name: ');
            }
          } else {
            setupName = await prompt(`Agent name [${hostname()}]: `) || hostname();
          }

          // --- Interactive: Role ---
          const roles = ['arch', 'pmo', 'dev', 'qa', 'devops'];
          console.log('\nAvailable roles:');
          roles.forEach((r, i) => console.log(`  ${i + 1}) ${r}`));
          const roleChoice = await prompt(`\nSelect role [3]: `);
          const roleIdx = parseInt(roleChoice || '3', 10) - 1;
          const setupRole = roles[roleIdx] ?? roles[2];

          // --- Interactive: Server URL ---
          const defaultServer = 'wss://api.agent-nexus.1702.store';
          const serverInput = await prompt(`\nServer URL [${defaultServer}]: `);
          const setupServer = serverInput || defaultServer;

          // Save config
          state.serverUrl = setupServer;
          state.agentName = setupName;
          state.role = setupRole;
          await saveState();

          // Add to plugins.allow
          const ocConfigPath = api.resolvePath('~/.openclaw/openclaw.json');
          try {
            let ocConfig: any = {};
            try { ocConfig = JSON.parse(await readFile(ocConfigPath, 'utf-8')); } catch {}
            if (!ocConfig.plugins) ocConfig.plugins = {};
            if (!Array.isArray(ocConfig.plugins.allow)) ocConfig.plugins.allow = [];
            if (!ocConfig.plugins.allow.includes('agent-nexus')) {
              ocConfig.plugins.allow.push('agent-nexus');
              await writeFile(ocConfigPath, JSON.stringify(ocConfig, null, 2), 'utf-8');
              console.log('Added agent-nexus to plugins.allow');
            }
          } catch {
            console.warn('Could not update openclaw.json — please add "agent-nexus" to plugins.allow manually.');
          }

          console.log(`\n  Server:  ${setupServer}`);
          console.log(`  Name:    ${setupName}`);
          console.log(`  Role:    ${setupRole}`);
          console.log(`\nRegistering...`);

          // Wait for register result via the shared client
          await new Promise<void>((resolve) => {
            const origOnMessage = client['opts'].onMessage;
            client['opts'].onMessage = (msg: WsMessage) => {
              origOnMessage(msg);
              if (msg.type === 'register.pending') {
                console.log(`\nRegistration submitted. Agent ID: ${msg.payload.agentId}`);
                console.log('Waiting for admin approval...');
              } else if (msg.type === 'register.approved') {
                console.log('\nApproved! Agent is connected.');
                client['opts'].onMessage = origOnMessage;
                resolve();
              } else if (msg.type === 'register.rejected') {
                console.error(`\nRejected: ${msg.payload.reason}`);
                client['opts'].onMessage = origOnMessage;
                resolve();
              }
            };

            const cfg = { serverUrl: setupServer, agentName: setupName, role: setupRole };
            client.connect(cfg.serverUrl, buildAuthMsg(cfg));
          });
        });

      nexus
        .command('status')
        .description('Show Agent Nexus connection status')
        .action(async () => {
          await loadState();
          const cfg = resolveConfig();
          console.log(`Server:    ${cfg.serverUrl}`);
          console.log(`Agent:     ${cfg.agentName} (${cfg.role || 'not configured'})`);
          console.log(`API Key:   ${state.apiKey ? state.apiKey.slice(0, 10) + '...' : 'not yet approved'}`);
          console.log(`Agent ID:  ${state.agentId ?? 'not registered'}`);
          console.log(`Connected: ${client.connected ? 'yes' : 'no'}`);
        });
    }, { descriptors: [{ name: 'nexus', description: 'Agent Nexus management', hasSubcommands: true }] });

    // --- Auto-connect on startup ---

    process.nextTick(async () => {
      try {
        await loadState();
        const cfg = resolveConfig();
        if (!cfg.role) {
          log.warn('[nexus] Not configured. Run "openclaw nexus setup" to get started.');
          return;
        }
        log.info(`[nexus] Connecting as ${cfg.agentName} (${cfg.role}) to ${cfg.serverUrl}`);
        client.connect(cfg.serverUrl, buildAuthMsg(cfg));
      } catch (err) {
        log.error(`[nexus] Auto-connect failed: ${err}`);
      }
    });

    // Session hooks
    api.on('session_start', (event: any) => {
      if (!client.connected || !state.apiKey) return;
      client.send({ type: 'session.start', payload: { sessionId: event.sessionId, taskName: event.resumedFrom ? `resumed:${event.resumedFrom}` : undefined } });
    });

    api.on('session_end', (event: any) => {
      if (!client.connected || !state.apiKey) return;
      client.send({ type: 'session.end', payload: { sessionId: event.sessionId, status: 'completed' } });
    });

    api.on('gateway_stop', () => {
      client.destroy();
    });
  },
};

// --- Event delivery handler ---

async function handleEventDeliver(
  payload: {
    eventId: string;
    correlationId?: string;
    threadId?: string;
    eventType: string;
    sourceAgentId: string;
    content?: string;
    url?: string;
    sourceContext?: { sessionId?: string; channel?: string; groupId?: string };
    payload: Record<string, unknown>;
  },
  log: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void },
  api: any,
): Promise<void> {
  const { eventId, correlationId, eventType, sourceAgentId, content, url, sourceContext } = payload;

  // Format the event as initial input for a spawned session
  const lines = [
    `[AGENT NEXUS EVENT — eventType=${eventType}]`,
    `from: ${sourceAgentId}`,
    `correlationId: ${correlationId || 'none'}`,
    `sourceContext:`,
    `  sessionId: ${sourceContext?.sessionId || 'none'}`,
    `  channel:   ${sourceContext?.channel || 'none'}`,
    `  groupId:   ${sourceContext?.groupId || 'none'}`,
  ];
  if (url) lines.push(`url: ${url}`);
  lines.push('', content || '(no content)');

  const initialInput = lines.join('\n');

  log.info(`[nexus] Received event ${eventId} (type=${eventType}) from ${sourceAgentId}`);

  // Try to spawn a session via Gateway HTTP API
  try {
    const gatewayInfo = await loadGatewayInfo(api);
    if (!gatewayInfo) {
      log.warn(`[nexus] Cannot spawn session: gateway info not available`);
      return;
    }

    const spawnUrl = `http://127.0.0.1:${gatewayInfo.port}/sessions/spawn`;
    const res = await fetch(spawnUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${gatewayInfo.token}`,
      },
      body: JSON.stringify({
        task: initialInput,
        mode: 'run',
        label: `nexus-event-${eventType}-${eventId.slice(0, 8)}`,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      log.warn(`[nexus] Spawn session failed (HTTP ${res.status}): ${body}`);
      return;
    }

    log.info(`[nexus] Spawned session for event ${eventId}`);
  } catch (err) {
    log.error(`[nexus] Failed to spawn session for event ${eventId}: ${err}`);
  }
}

// --- Gateway info cache (TTL 60s) ---

let gatewayCache: { port: number; token: string } | null = null;
let gatewayCacheTime = 0;
const GATEWAY_CACHE_TTL = 60_000;

async function loadGatewayInfo(
  api: any,
): Promise<{ port: number; token: string } | null> {
  if (gatewayCache && Date.now() - gatewayCacheTime < GATEWAY_CACHE_TTL) {
    return gatewayCache;
  }
  try {
    const configPath = api.resolvePath('~/.openclaw/openclaw.json');
    const raw = await readFile(configPath, 'utf-8');
    const config = JSON.parse(raw);
    const port = config.gateway?.port ?? 18789;
    const token = config.gateway?.auth?.token;
    if (!token) return null;
    gatewayCache = { port, token };
    gatewayCacheTime = Date.now();
    return gatewayCache;
  } catch {
    return null;
  }
}
