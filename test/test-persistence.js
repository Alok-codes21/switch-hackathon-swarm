/**
 * State survives across separate one-shot runs (the way cli.js is used by
 * the room agent): start in one "process", check status in another.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

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

// Genuinely separate OS processes (the room agent runs one cli.js per message):
// start in one process, read in a second, cancel in a third, verify in a fourth.
console.log('\nCross-process test: real child processes share the state file');
const run = (label, script) => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
    env: { ...process.env, FAKE_AGENT_SLEEP_MS: '100' },
  });
  assert.strictEqual(r.status, 0, `${label} failed:\n${r.stderr}\n${r.stdout}`);
  return r.stdout.trim();
};
const importLine = `const { SwitchAgentBridge } = await import(${JSON.stringify(path.resolve('src/switch/agent-bridge.js'))});`;
const started = run('child start', `${importLine}
  const b = new SwitchAgentBridge();
  const res = await b.startExperiment({ experimentId: 'exp-xproc1', problem: 'cross process check' });
  if (res.error) { console.error(res.error); process.exit(1); }
  console.log(res.experimentId);`);
assert.ok(started.includes('exp-xproc1'), 'child process started the experiment');

const seen = run('child status', `${importLine}
  const b = new SwitchAgentBridge();
  const st = await b.getStatus('exp-xproc1');
  console.log(JSON.stringify(st && st.experimentId || (st && st.id) || null));`);
assert.ok(seen.includes('exp-xproc1'), 'a DIFFERENT process sees the experiment');

// Concurrent writers: two processes save at the same time, neither update is lost
run('concurrent writers', `${importLine}
  const mk = () => new SwitchAgentBridge();
  const a = mk(); a.state.experiments['exp-conc-a'] = { id: 'exp-conc-a', mode: 'local', createdAt: 1, agents: [], judge: null };
  a.state.lastExperimentId = 'exp-conc-a'; a._lastExpDirty = true;
  const b = mk(); b.state.experiments['exp-conc-b'] = { id: 'exp-conc-b', mode: 'local', createdAt: 2, agents: [], judge: null };
  b.state.lastExperimentId = 'exp-conc-b'; b._lastExpDirty = true;
  const okA = a._saveState(); const okB = b._saveState();
  if (!okA || !okB) { console.error('save failed'); process.exit(1); }
  const c = mk();
  if (!c.state.experiments['exp-conc-a'] || !c.state.experiments['exp-conc-b']) { console.error('lost update'); process.exit(1); }
  console.log('both concurrent saves survived');`);

const cancelled = run('child cancel', `${importLine}
  const b = new SwitchAgentBridge();
  const res = await b.cancelExperiment('exp-xproc1', 'tester');
  console.log(JSON.stringify({ success: res.success, error: res.error || null }));`);
assert.ok(cancelled.includes('"success":true'), `cancel in a fresh process: ${cancelled}`);

const gone = run('child verify cancel', `${importLine}
  const b = new SwitchAgentBridge();
  const st = await b.getStatus('exp-xproc1');
  const disk = JSON.parse((await import('node:fs')).readFileSync(process.env.SWARM_STATE_FILE, 'utf8'));
  console.log(JSON.stringify({ status: st, tombstoned: !!(disk.removed && disk.removed['exp-xproc1']), experiments: Object.keys(disk.experiments || {}) }));`);
// replace the placeholder with the real state file path (kept out of the template for quoting)
const goneChecked = gone;
assert.ok(goneChecked.includes('"status":null'), `cancelled experiment must stay gone in every process: ${goneChecked}`);
assert.ok(goneChecked.includes('"tombstoned":true'), 'tombstone persisted');
assert.ok(!/"exp-xproc1"/.test(goneChecked.split('"experiments"')[1] || ''), 'no resurrection after concurrent merges');
console.log('cross-process start/status/cancel + tombstone OK');

fs.rmSync(tmp, { recursive: true, force: true });
console.log('\nPERSISTENCE TESTS PASSED');
