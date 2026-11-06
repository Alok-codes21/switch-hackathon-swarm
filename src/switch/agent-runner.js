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

import { spawn } from 'node:child_process';
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
  log.write(`[runner] agent=${agentId} cwd=${dir}\n[runner] command=${command}\n`);

  let tail = '';
  const capture = (chunk) => {
    const s = chunk.toString();
    log.write(s);
    tail = (tail + s).slice(-TAIL_CHARS);
  };

  let child;
  try {
    child = spawn(command, { shell: true, cwd: dir });
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

  const killer = setTimeout(() => {
    log.write(`\n[runner] timeout after ${TIMEOUT_MS}ms, killing agent\n`);
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { shell: true });
      } else {
        child.kill('SIGTERM');
      }
    } catch {}
  }, TIMEOUT_MS);

  child.on('error', (err) => {
    clearTimeout(killer);
    log.end();
    writeResult({
      agentId, status: 'failed', exitCode: null, startedAt,
      finishedAt: new Date().toISOString(), durationMs: Date.now() - t0,
      summary: '', outputTail: tail,
      error: `agent command failed to start: ${err.message}`
    });
  });

  child.on('close', (code) => {
    clearTimeout(killer);
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
