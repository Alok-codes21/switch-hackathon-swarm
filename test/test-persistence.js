/**
 * State survives across separate one-shot runs (the way cli.js is used by
 * the room agent): start in one "process", check status in another.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-persist-'));
fs.mkdirSync(path.join(tmp, 'root'), { recursive: true });
process.env.SWARM_ROOT = path.join(tmp, 'root');
process.env.SWARM_STATE_FILE = path.join(tmp, 'state.json');
process.env.SWARM_WORKTREE_DIR = path.join(tmp, '.worktrees');
process.env.SWARM_PROMOTED_DIR = path.join(tmp, 'promoted');
process.env.SWARM_AGENT_CMD = `node "${path.resolve('test/fake-agent.js')}" {prompt}`;
process.env.FAKE_AGENT_SLEEP_MS = '2000'; // stay running so status catches it mid-flight
process.env.SUPERVISOR_API_URL = 'http://localhost:1';

const { CommandHandler } = await import('../src/chat/commands.js');
const { SwitchAgentBridge } = await import('../src/switch/agent-bridge.js');

const stateFile = process.env.SWARM_STATE_FILE;
const make = () => {
  const b = new SwitchAgentBridge(undefined, 'http://localhost:1', stateFile);
  return new CommandHandler(b, b);
};

// "Process 1": start an experiment
const out = await make().handleMessage('/experiment API is slow', 'alok');
const id = out.match(/exp-[a-z0-9]+/)[0];

// "Process 2": a brand new bridge must still know the experiment
const status = await make().handleMessage(`/status ${id}`, 'alok');
assert.ok(!status.includes('No active experiment'), 'status should find experiment from a previous run');
assert.ok(status.includes(id));
console.log('cross-process status OK:');
console.log(status);

// Cancel in another fresh process, then status must report it gone
await make().handleMessage(`/cancel ${id}`, 'alok');
const after = await make().handleMessage(`/status ${id}`, 'alok');
assert.ok(after.includes('No active experiment'));

fs.rmSync(tmp, { recursive: true, force: true });
console.log('\nPERSISTENCE TESTS PASSED');
