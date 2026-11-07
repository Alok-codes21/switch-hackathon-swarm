/**
 * index.js
 * Person 1 entrypoint for the Hackathon.
 * Boots the chat listener and verifies Switch connectivity.
 */

import 'dotenv/config';
import { CommandHandler } from './chat/commands.js';
import { SwitchAgentBridge } from './switch/agent-bridge.js';

const SWITCH_API_URL = process.env.SWITCH_API_URL || 'http://localhost:49921';
const SUPERVISOR_API_URL = process.env.SUPERVISOR_API_URL || 'http://127.0.0.1:3000';

async function main() {
  console.log('====================================================');
  console.log('🤖 Git Worktree Experiment Swarm - Person 1 Runtime');
  console.log('====================================================');
  console.log(`🔗 Switch API:      ${SWITCH_API_URL}`);
  console.log(`🔗 Supervisor API:  ${SUPERVISOR_API_URL}`);

  const bridge = new SwitchAgentBridge(SWITCH_API_URL, SUPERVISOR_API_URL);
  const commandHandler = new CommandHandler(bridge, bridge);

  console.log('\n✅ Person 1 Chat & Switch handler is ready!');
  console.log('Available Commands:');
  console.log('  /experiment <problem>  - Starts a new multi-agent swarm in separate worktrees');
  console.log('  /status <id>           - Views test and benchmark progress');
  console.log('  /cancel <id>           - Stops experiments and tears down worktrees');
  console.log('  /promote <id> <agent>  - Human approval to merge best candidate');
  console.log('====================================================\n');

  // Interactive CLI loop for local testing or piped from Mattermost/Discord
  process.stdin.setEncoding('utf-8');
  process.stdout.write('Chat prompt > ');

  process.stdin.on('data', async (data) => {
    const input = data.toString().trim();
    if (input.toLowerCase() === 'exit') {
      process.exit(0);
    }

    if (input) {
      const response = await commandHandler.handleMessage(input);
      if (response) {
        console.log(`\n${response}\n`);
      } else {
        console.log(`(Received standard message: "${input}". Use /experiment to trigger a swarm.)\n`);
      }
    }
    process.stdout.write('Chat prompt > ');
  });
}

main().catch(console.error);
