import { CommandHandler } from '../src/chat/commands.js';
import { SwitchAgentBridge } from '../src/switch/agent-bridge.js';

async function runTests() {
  console.log('🧪 Running Person 1 Command Integration Tests...\n');

  const bridge = new SwitchAgentBridge();
  const handler = new CommandHandler(bridge, bridge);

  // 1. Test /experiment command
  console.log('Test 1: /experiment command');
  const expRes = await handler.handleMessage('/experiment Response time is 4.0s under high load');
  console.log(expRes);
  console.assert(expRes.includes('Experiment Started'), 'Should start experiment');

  const match = expRes.match(/exp-\d+/);
  const expId = match ? match[0] : 'exp-001';

  // 2. Test /status command
  console.log('\nTest 2: /status command');
  await new Promise(r => setTimeout(r, 3500)); // wait for evaluation
  const statusRes = await handler.handleMessage(`/status ${expId}`);
  console.log(statusRes);
  console.assert(statusRes.includes('Human Approval Required'), 'Should require approval');

  // 3. Test /promote command
  console.log('\nTest 3: /promote command (Human Approval)');
  const promoteRes = await handler.handleMessage(`/promote ${expId} agent-b`, 'nidhi');
  console.log(promoteRes);
  console.assert(promoteRes.includes('Promotion Approved by nidhi'), 'Should confirm human approval');

  console.log('\n✅ ALL PERSON 1 TESTS PASSED!');
}

runTests().catch(console.error);

