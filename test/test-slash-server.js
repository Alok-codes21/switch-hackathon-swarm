import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const PORT = 4123;
const BASE = `http://localhost:${PORT}`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-slash-'));
fs.mkdirSync(path.join(tmp, 'root'), { recursive: true });

function startServer() {
  const child = spawn('node', ['src/server/slash-server.js'], {
    env: {
      ...process.env,
      PORT: String(PORT),
      MM_SLASH_TOKEN: 'test-token',
      SUPERVISOR_API_URL: 'http://localhost:1', // force local real-agent mode
      SWARM_ROOT: path.join(tmp, 'root'),
      SWARM_STATE_FILE: path.join(tmp, 'state.json'),
      SWARM_WORKTREE_DIR: path.join(tmp, '.worktrees'),
      SWARM_PROMOTED_DIR: path.join(tmp, 'promoted'),
      SWARM_AGENT_CMD: `node "${path.resolve('test/fake-agent.js')}" {prompt}`,
      FAKE_AGENT_SLEEP_MS: '300',
    },
    stdio: 'pipe',
  });
  return new Promise((resolve, reject) => {
    child.stdout.on('data', (d) => {
      if (d.toString().includes('listening')) resolve(child);
    });
    child.on('error', reject);
    setTimeout(() => reject(new Error('server did not start')), 8000);
  });
}

async function post(pathname, fields) {
  const res = await fetch(`${BASE}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  });
  return { status: res.status, body: await res.json() };
}

const server = await startServer();
try {
  // health
  const health = await fetch(`${BASE}/health`).then((r) => r.json());
  console.assert(health.ok === true, 'health check');
  console.log('Test 1 OK: /health', JSON.stringify(health));

  // wrong token rejected
  const bad = await post('/slash/experiment', { token: 'wrong', text: 'x', user_name: 'tester' });
  console.assert(bad.status === 401, 'bad token should be 401');
  console.log('Test 2 OK: wrong token rejected with', bad.status);

  // /experiment posts a public (in_channel) answer
  const exp = await post('/slash/experiment', {
    token: 'test-token',
    text: 'Compare iPhone 16 prices on Amazon and Flipkart',
    user_name: 'tester',
  });
  console.assert(exp.status === 200, 'experiment 200');
  console.assert(exp.body.response_type === 'in_channel', 'experiment must be public');
  console.assert(exp.body.text.includes('Experiment Started'), 'experiment started');
  console.log('Test 3 OK: /experiment public response');
  console.log(exp.body.text);

  const expId = exp.body.text.match(/exp-[a-z0-9]+/)[0];

  // poll /status until the real agents + judge finish
  let status;
  for (let i = 0; i < 60; i++) {
    status = await post('/slash/status', { token: 'test-token', text: expId, user_name: 'tester' });
    if (status.body.text.includes('Experiment Complete')) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  console.assert(status.body.text.includes('Human Approval Required'), 'status requires approval');
  console.assert(status.body.text.includes('agent-b'), 'winner shown');
  console.log('\nTest 4 OK: /status shows real results + approval gate');
  console.log(status.body.text);

  // /promote
  const promote = await post('/slash/promote', { token: 'test-token', text: `${expId} agent-b`, user_name: 'tester' });
  console.assert(promote.body.text.includes('Promotion Approved by tester'), 'promotion approved by sender');
  console.log('\nTest 5 OK: /promote approved');

  // /cancel
  const cancel = await post('/slash/cancel', { token: 'test-token', text: expId, user_name: 'tester' });
  console.assert(cancel.body.text.includes('cancelled'), 'cancel works');
  console.log('Test 6 OK: /cancel');

  console.log('\n✅ ALL SLASH-SERVER TESTS PASSED!');
} finally {
  server.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
}
