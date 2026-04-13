#!/usr/bin/env tsx
/**
 * Standalone runner for the Agent Nexus OpenClaw plugin.
 * Run directly: tsx standalone.ts
 *
 * Simulates the OpenClaw plugin API so the plugin can run without the gateway.
 */
import { Command } from 'commander';
import pluginDef from './index.js';

const program = new Command('agent-nexus-plugin');

// Read config from env or defaults
const config = {
  serverUrl: process.env.NEXUS_SERVER_URL || 'ws://localhost:9000',
  agentName: process.env.NEXUS_AGENT_NAME || 'standalone-agent',
  role: process.env.NEXUS_ROLE || 'dev',
};

// Collected hooks
const hooks: Record<string, Function[]> = {};

// Mock the OpenClaw plugin API
const api = {
  pluginConfig: config,
  logger: {
    info: (msg: string) => console.log(msg),
    warn: (msg: string) => console.warn(msg),
    error: (msg: string) => console.error(msg),
    debug: (msg: string) => {},
  },
  resolvePath: (input: string) => input.replace('~', process.env.HOME || ''),
  on: (hookName: string, handler: Function) => {
    if (!hooks[hookName]) hooks[hookName] = [];
    hooks[hookName].push(handler);
  },
  registerHook: (hookName: string, handler: Function) => {
    if (!hooks[hookName]) hooks[hookName] = [];
    hooks[hookName].push(handler);
  },
  registerCli: (registrar: Function) => {
    registrar({ program });
  },
};

// Run the plugin
pluginDef.register(api);

// If CLI args provided (e.g. "nexus setup"), run commander
if (process.argv.length > 2) {
  program.parse(process.argv);
} else {
  // No args — just run as daemon, keep alive
  console.log(`Agent Nexus plugin running standalone`);
  console.log(`  Server:  ${config.serverUrl}`);
  console.log(`  Agent:   ${config.agentName} (${config.role})`);
  console.log(`  Press Ctrl+C to stop\n`);

  // Keep process alive
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    // Trigger gateway_stop hook
    for (const handler of hooks['gateway_stop'] ?? []) {
      handler({ reason: 'standalone shutdown' }, {});
    }
    setTimeout(() => process.exit(0), 500);
  });
}
