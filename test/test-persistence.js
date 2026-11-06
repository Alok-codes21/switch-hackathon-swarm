import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { CommandHandler } from '../src/chat/commands.js';
import { SwitchAgentBridge } from '../src/switch/agent-bridge.js';

const file = path.join(os.tmpdir(), `swarm-state-${Date.now()}.json`);
const make = () => { const b = new SwitchAgentBridge(undefined, 'http://localhost:1', file); return new CommandHandler(b, b); };

// "Process 1": start an experiment
const out = await make().handleMessage('/experiment API is slow', 'alok');
const id = out.match(/exp-\d+/)[0];

// "Process 2": a brand new bridge must still know the experiment
const status = await make().handleMessage(`/status ${id}`, 'alok');
assert.ok(!status.includes('No active experiment'), 'status should find experiment from a previous run');
assert.ok(status.includes(id));

// Cancel in another fresh process, then status must report it gone
await make().handleMessage(`/cancel ${id}`, 'alok');
const after = await make().handleMessage(`/status ${id}`, 'alok');
assert.ok(after.includes('No active experiment'));

fs.rmSync(file, { force: true });
console.log('PERSISTENCE TESTS PASSED');
