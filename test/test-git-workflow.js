/**
 * Git-mode end-to-end test: the path a developer gets when they clone the
 * repository normally (with .git). Uses the fake agent CLI. Verifies REAL
 * worktrees, REAL candidate branches and a REAL merge commit on the branch
 * the experiment started from - plus the guard that refuses to promote onto
 * a different branch than the experiment's base.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-git-test-'));
const root = path.join(tmp, 'root');
fs.mkdirSync(root, { recursive: true });

// A real git repo with one commit, on branch "main"
const git = (args, cwd = root) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, `git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout.trim();
};
git(['init', '-b', 'main']);
git(['config', 'user.email', 'test@example.com']);
git(['config', 'user.name', 'Test']);
fs.writeFileSync(path.join(root, 'app.js'), 'console.log("v1")\n');
git(['add', '-A']);
git(['commit', '-m', 'initial']);

process.env.SWARM_ROOT = root;
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

console.log('Git Test 1: experiment creates real worktrees and branches');
const expRes = await handler.handleMessage('/experiment add a health endpoint', 'tester');
assert.ok(expRes.includes('Experiment Started'), expRes);
const expId = expRes.match(/exp-[a-z0-9]+/)[0];
const branches = git(['branch', '--list', `experiment/${expId}-*`]);
assert.ok(branches.includes(`experiment/${expId}-a`), 'agent-a branch exists');
assert.ok(branches.includes(`experiment/${expId}-b`), 'agent-b branch exists');
const wtA = path.join(tmp, '.worktrees', `${expId}-a`);
assert.ok(fs.existsSync(path.join(wtA, '.git')), 'agent-a folder is a real git worktree');
console.log('  worktrees + branches OK');

console.log('\nGit Test 2: agents finish, judge runs');
const done = await waitFor(/Experiment Complete/, `/status ${expId}`);
assert.ok(done.includes('Recommended Winner'), done);
console.log('  complete OK');

console.log('\nGit Test 2b: finished agents are auto-committed on their experiment branches');
for (const letter of ['a', 'b']) {
  const branch = `experiment/${expId}-${letter}`;
  const author = git(['log', '-1', '--format=%an', branch]);
  assert.strictEqual(author, 'Alok-codes21', `${branch} commit must be authored as the project owner, got "${author}"`);
  const committed = git(['ls-tree', '-r', '--name-only', branch]);
  assert.ok(committed.split('\n').includes('demo.txt'), `${branch} commit contains the agent's new output file (was left untracked before the fix)`);
  assert.ok(committed.split('\n').includes('SUMMARY.md'), `${branch} commit contains SUMMARY.md`);
  assert.ok(!committed.split('\n').includes('prompt.txt'), `${branch} commit must not contain prompt.txt`);
  assert.ok(!committed.split('\n').includes('output.log'), `${branch} commit must not contain output.log`);
  const subject = git(['log', '-1', '--format=%s', branch]);
  assert.ok(subject.includes(expId), `${branch} commit message names the experiment`);
  const wtStatus = git(['status', '--porcelain'], path.join(tmp, '.worktrees', `${expId}-${letter}`));
  assert.strictEqual(wtStatus, '', `${branch} worktree is clean after the auto-commit`);
}
console.log('  auto-commit verified on both experiment branches');

console.log('\nGit Test 3: promote refuses the wrong base branch');
git(['checkout', '-b', 'not-the-base']);
const wrongBranch = await handler.handleMessage(`/promote ${expId} agent-b`, 'alok');
console.log(wrongBranch);
assert.ok(wrongBranch.includes('Promotion failed'), 'promote refused on wrong branch');
assert.ok(wrongBranch.includes('"main"'), 'error names the experiment base branch');
git(['checkout', 'main']);

console.log('\nGit Test 4: promote merges into the real base branch and says its name');
const promote = await handler.handleMessage(`/promote ${expId} agent-b`, 'alok');
console.log(promote);
assert.ok(promote.includes('Promotion Approved by alok'), 'approval named');
assert.ok(promote.includes('merged into `main`'), 'message names the ACTUAL target branch');
const head = git(['cat-file', '-p', 'HEAD']);
assert.strictEqual(head.split('\n').filter((l) => l.startsWith('parent ')).length, 2, 'HEAD is a real merge commit');
assert.ok(head.includes(`experiment/${expId}-b`) || git(['log', '-1', '--format=%s']).includes('Merge'), 'merge of candidate branch');
assert.ok(fs.existsSync(path.join(root, 'SUMMARY.md')), 'winner files landed on main');
assert.ok(fs.existsSync(path.join(root, 'demo.txt')), 'winner output landed on main');
assert.strictEqual(fs.readFileSync(path.join(root, 'demo.txt'), 'utf8').replace(/\r\n/g, '\n'), 'fake-agent real output\n', 'merged demo.txt carries the agent\'s real content (CRLF-normalised for Windows checkouts)');
console.log('  merge commit verified on main');

fs.rmSync(tmp, { recursive: true, force: true });
console.log('\nGIT WORKFLOW TESTS PASSED');
