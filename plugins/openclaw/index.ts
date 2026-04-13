import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { hostname, platform, release } from 'node:os';
import { NexusWsClient, type WsMessage } from './ws-client.js';
import { writeSkills, writeSkillUpdate } from './skills.js';

type PluginConfig = {
  serverUrl: string;
  agentName: string;
  role: string;
};

type PersistedState = {
  apiKey?: string;
  agentId?: string;
};

export default function (api: any) {
  const config = api.pluginConfig as PluginConfig | undefined;
  if (!config?.serverUrl || !config?.agentName || !config?.role) {
    api.logger.warn('[nexus] Missing config. Run "clawdbot nexus setup" first.');
    return;
  }

  const dataDir = api.resolvePath('~/.clawdbot/extensions/agent-nexus');
  const stateFile = join(dataDir, 'state.json');
  const skillsDir = api.resolvePath('~/.openclaw/workspace/skills');

  let state: PersistedState = {};
  let client: NexusWsClient;

  // --- State persistence ---

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

  // --- Message handling ---

  function handleMessage(msg: WsMessage): void {
    switch (msg.type) {
      case 'auth.ok':
        api.logger.info(`[nexus] Authenticated as ${msg.payload.name} (${msg.payload.role})`);
        writeSkills(skillsDir, config.role, msg.payload.skills).catch(() => {});
        break;

      case 'auth.fail':
        api.logger.warn(`[nexus] Auth failed: ${msg.payload.reason}`);
        // api_key invalid, clear it and re-register on next connect
        state.apiKey = undefined;
        saveState().catch(() => {});
        break;

      case 'register.pending':
        state.agentId = msg.payload.agentId;
        saveState().catch(() => {});
        api.logger.info(`[nexus] Registration pending approval (agentId: ${msg.payload.agentId})`);
        break;

      case 'register.approved':
        state.apiKey = msg.payload.apiKey;
        state.agentId = msg.payload.agentId;
        saveState().catch(() => {});
        api.logger.info(`[nexus] Approved! Connected as ${msg.payload.name} (${msg.payload.role})`);
        writeSkills(skillsDir, config.role, msg.payload.skills).catch(() => {});
        break;

      case 'register.rejected':
        api.logger.warn(`[nexus] Registration rejected: ${msg.payload.reason}`);
        break;

      case 'skills.update':
        writeSkillUpdate(skillsDir, msg.payload.scope, config.role, msg.payload.files).catch(() => {});
        api.logger.info(`[nexus] Skills updated (${msg.payload.scope})`);
        break;

      case 'heartbeat.ack':
        break;

      case 'error':
        api.logger.warn(`[nexus] Server error: ${msg.payload.reason}`);
        break;
    }
  }

  function onConnected(): void {
    if (state.apiKey) {
      // Have api_key — auth (clock in)
      client.send({
        type: 'auth',
        payload: {
          apiKey: state.apiKey,
          hostname: hostname(),
          os: `${platform()} ${release()}`,
        },
      });
    } else {
      // No api_key — register (or re-register to check if approved)
      client.send({
        type: 'register',
        payload: {
          name: config.agentName,
          agentType: 'openclaw',
          role: config.role,
          hostname: hostname(),
          os: `${platform()} ${release()}`,
        },
      });
    }
  }

  // --- Plugin lifecycle ---

  // Connect immediately on plugin load
  (async () => {
    await loadState();

    client = new NexusWsClient({
      serverUrl: config.serverUrl,
      onMessage: handleMessage,
      onOpen: onConnected,
      logger: api.logger,
    });

    client.connect();
  })();

  // Session hooks
  api.on('session_start', (event: any) => {
    if (!client?.connected || !state.apiKey) return;
    client.send({
      type: 'session.start',
      payload: { sessionId: event.sessionId, taskName: event.resumedFrom ? `resumed:${event.resumedFrom}` : undefined },
    });
  });

  api.on('session_end', (event: any) => {
    if (!client?.connected || !state.apiKey) return;
    client.send({
      type: 'session.end',
      payload: { sessionId: event.sessionId, status: 'completed' },
    });
  });

  // Clean up on gateway stop (if it fires)
  api.on('gateway_stop', () => {
    client?.destroy();
  });

  // --- CLI: nexus setup ---

  api.registerCli(({ program }: any) => {
    const nexus = program.command('nexus').description('Agent Nexus management');

    nexus
      .command('setup')
      .description('Configure Agent Nexus connection')
      .action(async () => {
        // Setup is handled by configSchema + uiHints in the plugin manifest.
        // This command is for manual re-registration.
        await loadState();

        if (state.apiKey) {
          console.log(`Already registered and approved. API key: ${state.apiKey.slice(0, 10)}...`);
          console.log('To re-register, delete state file and run setup again.');
          return;
        }

        console.log(`Registering ${config.agentName} (${config.role}) with ${config.serverUrl}...`);

        const ws = new NexusWsClient({
          serverUrl: config.serverUrl,
          onMessage: (msg) => {
            if (msg.type === 'register.pending') {
              state.agentId = msg.payload.agentId;
              saveState();
              console.log(`Registration submitted. Agent ID: ${msg.payload.agentId}`);
              console.log('Waiting for admin approval. You can close this — approval will be picked up automatically.');
              ws.destroy();
              process.exit(0);
            } else if (msg.type === 'register.approved') {
              state.apiKey = msg.payload.apiKey;
              state.agentId = msg.payload.agentId;
              saveState();
              console.log(`Approved! API key saved. Agent is ready.`);
              ws.destroy();
              process.exit(0);
            } else if (msg.type === 'register.rejected') {
              console.error(`Rejected: ${msg.payload.reason}`);
              ws.destroy();
              process.exit(1);
            }
          },
          onOpen: () => {
            ws.send({
              type: 'register',
              payload: {
                name: config.agentName,
                agentType: 'openclaw',
                role: config.role,
                hostname: hostname(),
                os: `${platform()} ${release()}`,
              },
            });
          },
          logger: { info: () => {}, warn: console.warn, error: console.error },
        });

        ws.connect();
      });

    nexus
      .command('status')
      .description('Show Agent Nexus connection status')
      .action(async () => {
        await loadState();
        console.log(`Server:    ${config.serverUrl}`);
        console.log(`Agent:     ${config.agentName} (${config.role})`);
        console.log(`API Key:   ${state.apiKey ? state.apiKey.slice(0, 10) + '...' : 'not yet approved'}`);
        console.log(`Agent ID:  ${state.agentId ?? 'not registered'}`);
        console.log(`Connected: ${client?.connected ? 'yes' : 'no'}`);
      });
  }, { commands: ['nexus'] });
}
