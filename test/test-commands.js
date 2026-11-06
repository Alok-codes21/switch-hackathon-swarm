/**
 * End-to-end test of the real local swarm flow using a fake agent CLI
 * (test/fake-agent.js) instead of OpenCode. Every result shown comes from
 * actual runner processes, work folders and result files - nothing mocked.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-test-'));
fs.mkdirSync(path.join(tmp, 'root'), { recursive: true });
process.env.SWARM_ROOT = path.join(tmp, 'root');
process.env.SWARM_STATE_FILE = path.join(tmp, 'state.json');
process.env.SWARM_WORKTREE_DIR = path.join(tmp, '.worktrees');
process.env.SWARM_PROMOTED_DIR = path.join(tmp, 'promoted');
process.env.SWARM_AGENT_CMD = `node "${path.resolve('test/fake-agent.js')}" {prompt}`;
process.env.FAKE_AGENT_SLEEP_MS = '300';
process.env.SUPERVISOR_API_URL = 'http://localhost:1'; // force local mode

const { CommandHandler } = await import('../src/chat/commands.js');
const { SwitchAgentBridge } = await import('../src/switch/agent-bridge.js');

const bridge = new SwitchAgentBridge();
const handler = new CommandHandler(bridge, bridge);

async function waitFor(re, cmd, timeoutMs = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const out = await handler.handleMessage(cmd, 'tester');
    if (re.test(out)) return out;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`timed out waiting for ${re} via "${cmd}"`);
}

console.log('Test 1: /experiment starts real agents');
const expRes = await handler.handleMessage('/experiment Compare iPhone 16 prices on Amazon and Flipkart');
console.log(expRes);
assert.ok(expRes.includes('Experiment Started'), 'Should start experiment');
assert.ok(expRes.includes('agent-a') && expRes.includes('agent-b'), 'Should list both agents');
assert.ok(!expRes.includes('caching'), 'No fake hypothesis labels');
const expId = expRes.match(/exp-[a-z0-9]+/)[0];

console.log('\nTest 2: work folders and runner processes really exist');
const dirA = path.join(tmp, '.worktrees', `${expId}-a`);
assert.ok(fs.existsSync(path.join(dirA, 'prompt.txt')), 'agent A folder has its prompt');

console.log('\nTest 3: /status while agents run');
const running = await handler.handleMessage(`/status ${expId}`);
console.log(running);
assert.ok(/Status|judging|Complete/.test(running), 'shows progress');

console.log('\nTest 4: /status until real results + judge verdict');
const done = await waitFor(/Experiment Complete/, `/status ${expId}`);
console.log(done);
assert.ok(done.includes('Recommended Winner'), 'winner recommended');
assert.ok(done.includes('agent-b'), 'fake judge picked agent-b');
assert.ok(done.includes('Human Approval Required'), 'approval gate present');
assert.ok(/summary/i.test(done), 'real agent summaries shown');

console.log('\nTest 5: /status without ID shows the latest experiment');
const latest = await handler.handleMessage('/status');
assert.ok(latest.includes(expId), 'latest experiment shown');

console.log('\nTest 6: /promote really copies the winner files');
const promote = await handler.handleMessage(`/promote ${expId} agent-b`, 'alok');
console.log(promote);
assert.ok(promote.includes('Promotion Approved by alok'), 'approval named');
assert.ok(promote.includes('copied'), 'zip-mode promote is honest about copying');
const promoted = path.join(tmp, 'promoted', `${expId}-agent-b`);
assert.ok(fs.existsSync(path.join(promoted, 'SUMMARY.md')), 'winner SUMMARY.md promoted');
assert.ok(fs.existsSync(path.join(promoted, 'demo.txt')), 'winner output file promoted');

console.log('\nTest 7: /cancel stops everything and cleans up');
const exp2 = await handler.handleMessage('/experiment second problem');
const exp2Id = exp2.match(/exp-[a-z0-9]+/)[0];
await handler.handleMessage(`/cancel ${exp2Id}`);
const after = await handler.handleMessage(`/status ${exp2Id}`);
assert.ok(after.includes('No active experiment'), 'cancelled experiment is gone');
assert.ok(!fs.existsSync(path.join(tmp, '.worktrees', `${exp2Id}-a`)), 'work folder removed');

console.log('\nTest 8: failed agent is reported, never faked');
process.env.SWARM_AGENT_CMD = 'node -e "process.exit(3)"';
const exp3 = await handler.handleMessage('/experiment doomed problem');
const exp3Id = exp3.match(/exp-[a-z0-9]+/)[0];
const failed = await waitFor(/Experiment Complete/, `/status ${exp3Id}`);
console.log(failed);
assert.ok(failed.includes('❌'), 'failure shown honestly');
assert.ok(!failed.includes('Recommended Winner'), 'no fake winner on failure');
process.env.SWARM_AGENT_CMD = `node "${path.resolve('test/fake-agent.js')}" {prompt}`;

fs.rmSync(tmp, { recursive: true, force: true });
console.log('\n✅ ALL PERSON 1 TESTS PASSED!');
