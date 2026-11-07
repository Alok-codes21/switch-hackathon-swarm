#!/usr/bin/env node
/**
 * agent-runner.js
 * Runs ONE real swarm agent (an AI CLI such as OpenCode) inside its own
 * folder, captures everything it prints, and writes a machine-readable
 * result file. agent-bridge.js launches this file detached, once per agent:
 *
 *   node src/switch/agent-runner.js --dir <folder> --agent <agentId> \
 *     --prompt-file <file> --result <file> --log <file>
 *
 * The agent command comes from SWARM_AGENT_CMD.
 * Default: opencode run {prompt}
 * {prompt} is replaced by the prompt text. The command runs through the
 * system shell so .cmd shims (npm-installed CLIs) work on Windows.
 *
 * Result file JSON: { agentId, status, exitCode, startedAt, finishedAt,
 * durationMs, summary, outputTail, error? }
 * status: "completed" | "failed" | "timeout"
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : null;
}

const dir = argValue('--dir');
const agentId = argValue('--agent') || 'agent';
const promptFile = argValue('--prompt-file');
const resultFile = argValue('--result');
const logFile = argValue('--log');
const TIMEOUT_MS = Number(process.env.SWARM_AGENT_TIMEOUT_MS || 10 * 60 * 1000);
const TAIL_CHARS = 4000;
const SUMMARY_CHARS = 2000;

function escForShell(text) {
  if (process.platform === 'win32') {
    // cmd.exe: keep it inside double quotes, neutralise the chars that break it
    return '"' + text
      .replace(/\r?\n+/g, ' ')
      .replace(/"/g, "'")
      .replace(/[%^&|<>]/g, ' ')
      + '"';
  }
  return "'" + text.replace(/'/g, "'\\''") + "'";
}

function writeResult(result) {
  const tmp = resultFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(result, null, 2));
  fs.renameSync(tmp, resultFile);
}

function main() {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const prompt = fs.readFileSync(promptFile, 'utf8').trim();
  const template = process.env.SWARM_AGENT_CMD || 'opencode run {prompt}';
  const command = template.replace('{prompt}', escForShell(prompt));

  const log = fs.createWriteStream(logFile, { flags: 'a' });
  log.write(`[runner] agent=${agentId} cwd=${dir}\n`);

  let tail = '';
  const capture = (chunk) => {
    const s = chunk.toString();
    log.write(s);
    tail = (tail + s).slice(-TAIL_CHARS);
  };

  // Headless runs cannot answer permission prompts, so OpenCode would auto-reject
  // every file edit. Allow file edits and web fetch, and a short list of shell commands.
  // `npm run *` stays allowed by default because demo agents may use the project's
  // own scripts; set SWARM_AGENT_BASH_STRICT=1 to narrow the list to node + npm test.
  const strict = process.env.SWARM_AGENT_BASH_STRICT === '1';
  const bash = { '*': 'deny', 'node *': 'allow', 'npm test*': 'allow', 'ls*': 'allow', 'dir*': 'allow', 'cat *': 'allow', 'type *': 'allow' };
  if (!strict) bash['npm run *'] = 'allow';
  const permission = {
    edit: 'allow',
    webfetch: 'allow',
    bash,
  };
  try {
    const cfgFile = path.join(dir, 'opencode.json');
    if (!fs.existsSync(cfgFile)) {
      fs.writeFileSync(cfgFile, JSON.stringify({ $schema: 'https://opencode.ai/config.json', permission }, null, 2));
    }
  } catch {}

  let child;
  try {
    child = spawn(command, {
      shell: true, cwd: dir, stdio: ['ignore', 'pipe', 'pipe'],
      // Own process group on POSIX so a timeout can kill the whole tree, not just the shell.
      detached: process.platform !== 'win32',
      env: { ...process.env, OPENCODE_PERMISSION: JSON.stringify(permission) },
    });
  } catch (err) {
    log.end();
    writeResult({
      agentId, status: 'failed', exitCode: null, startedAt,
      finishedAt: new Date().toISOString(), durationMs: Date.now() - t0,
      summary: '', outputTail: '',
      error: `could not start agent command: ${err.message}`
    });
    return;
  }

  child.stdout.on('data', capture);
  child.stderr.on('data', capture);

  // The agent CLI runs in its own process group (detached on POSIX). Anyone who
  // wants this agent dead (timeout here, or the bridge killing THIS runner's
  // group on /cancel) must kill that group, or the CLI keeps running orphaned.
  // The bridge also reads the pid file below to kill the group directly.
  const pidFile = resultFile + '.pid';
  try { fs.writeFileSync(pidFile, String(child.pid)); } catch {}
  const removePidFile = () => { try { fs.rmSync(pidFile, { force: true }); } catch {} };

  function killChildTree(sig) {
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { shell: true });
      } else {
        // Kill the whole process group (the agent CLI runs inside the spawned shell).
        try { process.kill(-child.pid, sig); } catch { child.kill(sig); }
      }
    } catch {}
  }

  // Windows has no POSIX groups: confirm the whole descendant tree is gone via
  // the parent->child table instead of trusting the leader pid check.
  function windowsTreeAlive(pid, depth = 0) {
    if (depth > 6) return false;
    try { process.kill(pid, 0); } catch (e) { return e.code === 'EPERM'; }
    const ps = spawnSync('powershell', ['-NoProfile', '-Command',
      `Get-CimInstance Win32_Process -Filter "ParentProcessId=${pid}" | Select-Object -ExpandProperty ProcessId`],
      { encoding: 'utf8', windowsHide: true });
    if (ps.status !== 0) return true; // cannot enumerate: assume alive rather than skip a needed kill
    const children = (String(ps.stdout || '').match(/\d+/g) || []).map(Number).filter((c) => c && c !== pid);
    for (const c of children) {
      if (windowsTreeAlive(c, depth + 1)) return true;
    }
    return false;
  }

  // Is anything still alive in the agent's process GROUP? The shell leader can
  // exit while the real CLI process lives on in the same group; checking only
  // child.pid would then skip a needed SIGKILL.
  function groupAlive(pgid) {
    try {
      if (process.platform === 'win32') return windowsTreeAlive(pgid);
      process.kill(-pgid, 0);
      return true;
    } catch (e) {
      return e.code === 'EPERM';
    }
  }

  // SIGTERM is polite and a wedged agent can ignore it: escalate to SIGKILL.
  function killChildTreeWithEscalation() {
    killChildTree('SIGTERM');
    setTimeout(() => {
      if (groupAlive(child.pid)) killChildTree('SIGKILL');
    }, 4000).unref();
  }

  // The bridge cancels an experiment by killing THIS runner's process group.
  // Forward the signal to the agent's own group before dying, or the agent
  // CLI would keep working in a worktree the bridge is about to delete.
  for (const sig of ['SIGTERM', 'SIGINT']) {
    process.on(sig, () => {
      log.write(`\n[runner] got ${sig}, stopping agent\n`);
      killChildTreeWithEscalation();
      setTimeout(() => process.exit(128 + (sig === 'SIGINT' ? 2 : 15)), 4500).unref();
    });
  }

  const killer = setTimeout(() => {
    log.write(`\n[runner] timeout after ${TIMEOUT_MS}ms, killing agent\n`);
    killChildTreeWithEscalation();
  }, TIMEOUT_MS);

  // Only the first terminal event (error or close) writes the result file.
  let settled = false;

  child.on('error', (err) => {
    if (settled) return;
    settled = true;
    clearTimeout(killer);
    removePidFile();
    log.end();
    writeResult({
      agentId, status: 'failed', exitCode: null, startedAt,
      finishedAt: new Date().toISOString(), durationMs: Date.now() - t0,
      summary: '', outputTail: tail,
      error: `agent command failed to start: ${err.message}`
    });
  });

  child.on('close', (code) => {
    if (settled) return;
    settled = true;
    clearTimeout(killer);
    removePidFile();
    const durationMs = Date.now() - t0;
    let summary = '';
    try {
      summary = fs.readFileSync(path.join(dir, 'SUMMARY.md'), 'utf8').slice(0, SUMMARY_CHARS);
    } catch {}
    const timedOut = durationMs >= TIMEOUT_MS;
    log.end();
    writeResult({
      agentId,
      status: timedOut ? 'timeout' : code === 0 ? 'completed' : 'failed',
      exitCode: code,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs,
      summary,
      outputTail: tail,
      ...(timedOut ? { error: `timed out after ${Math.round(TIMEOUT_MS / 60000)} minutes` } : {})
    });
  });
}

if (!dir || !promptFile || !resultFile || !logFile) {
  console.error('usage: node agent-runner.js --dir D --agent ID --prompt-file P --result R --log L');
  process.exit(1);
}
main();
