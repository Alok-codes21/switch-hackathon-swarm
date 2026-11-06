#!/usr/bin/env node
/**
 * cli.js
 * One-shot runner for the Person 1 chat commands.
 *
 * Usage:
 *   node src/cli.js "/experiment <problem description>" [userId]
 *   node src/cli.js "/status <experimentId>" [userId]
 *   node src/cli.js "/cancel <experimentId>" [userId]
 *   node src/cli.js "/promote <experimentId> <agentId>" [userId]
 *   node src/cli.js --file message.txt [userId]   (message read from a file: safe for
 *   quotes and line breaks that would break a shell command)
 *
 * Prints exactly the text that should be posted back to the chat room.
 * The room agent (OpenCode via Switch) runs this with its bash tool and
 * posts the output. See docs/ROOM-AGENT-INSTRUCTIONS.md.
 */

import 'dotenv/config';
import fs from 'node:fs';
import { CommandHandler } from './chat/commands.js';
import { SwitchAgentBridge } from './switch/agent-bridge.js';

const SWITCH_API_URL = process.env.SWITCH_API_URL || 'http://localhost:49921';
const SUPERVISOR_API_URL = process.env.SUPERVISOR_API_URL || 'http://127.0.0.1:3000';

async function main() {
  let input = process.argv[2];
  let userId = process.argv[3] || 'chat-user';
  if (input === '--file') {
    const file = process.argv[3];
    if (!file) {
      console.log('Usage: node src/cli.js --file message.txt [userId]');
      process.exit(1);
    }
    input = fs.readFileSync(file, 'utf8').trim();
    userId = process.argv[4] || 'chat-user';
  }

  if (!input) {
    console.log('Usage: node src/cli.js "/experiment <problem>" [userId]');
    process.exit(1);
  }

  const bridge = new SwitchAgentBridge(SWITCH_API_URL, SUPERVISOR_API_URL);
  const handler = new CommandHandler(bridge, bridge);
  const response = await handler.handleMessage(input, userId);

  if (response) {
    console.log(response);
  } else {
    console.log(`(Not a swarm command: "${input}". Known commands: /experiment, /status, /cancel, /promote)`);
  }
}

main().catch((err) => {
  console.error(`Command failed: ${err.message}`);
  process.exit(1);
});
