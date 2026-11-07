import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const execFileAsync = promisify(execFile);

export class CommandRunner {
  constructor(repositoryPath = process.cwd()) {
    this.repositoryPath = path.resolve(repositoryPath);
    this.configPath = path.join(
      this.repositoryPath,
      'config',
      'allowed-commands.json'
    );
    this.worktreeRoot = path.join(this.repositoryPath, '.worktrees');
  }

  async #loadConfig() {
    const content = await readFile(this.configPath, 'utf8');
    const config = JSON.parse(content);

    if (!config.commands || typeof config.commands !== 'object') {
      throw new Error('Invalid allowed-commands configuration.');
    }

    return config.commands;
  }

  async #validateWorktree(worktreePath) {
    const root = await realpath(this.worktreeRoot);
    const workingDirectory = await realpath(worktreePath);

    const relative = path.relative(root, workingDirectory);

    if (
      !relative ||
      relative === '.' ||
      relative.startsWith('..') ||
      path.isAbsolute(relative)
    ) {
      throw new Error('Execution is only allowed inside an agent worktree.');
    }

    // Confirm this directory is itself a registered Git worktree.
    const { stdout } = await execFileAsync(
      'git',
      ['rev-parse', '--show-toplevel'],
      {
        cwd: workingDirectory,
        windowsHide: true,
        timeout: 10000
      }
    );

    const gitRoot = await realpath(stdout.trim());

    if (gitRoot !== workingDirectory) {
      throw new Error('Execution directory is not a Git worktree root.');
    }

    return workingDirectory;
  }

  /**
   * Run one predefined command.
   * Callers provide a command ID, never a shell command.
   */
  async run(commandId, worktreePath) {
    if (typeof commandId !== 'string' || !commandId.trim()) {
      throw new Error('A command ID is required.');
    }

    const commands = await this.#loadConfig();
    const definition = commands[commandId];

    if (!definition) {
      throw new Error(`Command "${commandId}" is not allowlisted.`);
    }

    if (
      definition.executable !== 'node' ||
      !Array.isArray(definition.args) ||
      !definition.args.every(arg => typeof arg === 'string')
    ) {
      throw new Error(`Command "${commandId}" has an invalid configuration.`);
    }

    const cwd = await this.#validateWorktree(worktreePath);
    const timeoutMs = Number(definition.timeoutMs || 60000);
    const maxBuffer = Number(definition.maxBufferBytes || 1048576);

    if (
      !Number.isInteger(timeoutMs) ||
      timeoutMs < 1000 ||
      timeoutMs > 300000
    ) {
      throw new Error('Command timeout must be between 1000 and 300000 ms.');
    }

    if (
      !Number.isInteger(maxBuffer) ||
      maxBuffer < 1024 ||
      maxBuffer > 10485760
    ) {
      throw new Error('Command output limit is invalid.');
    }

    const startedAt = performance.now();

    try {
      const { stdout, stderr } = await execFileAsync(
        process.execPath,
        definition.args,
        {
          cwd,
          windowsHide: true,
          timeout: timeoutMs,
          maxBuffer,
          encoding: 'utf8',
          shell: false
        }
      );

      return {
        commandId,
        success: true,
        exitCode: 0,
        timedOut: false,
        durationMs: Math.round(performance.now() - startedAt),
        stdout,
        stderr
      };
    } catch (error) {
      const timedOut =
        error.code === 'ETIMEDOUT' ||
        error.signal === 'SIGTERM' ||
        error.killed === true;

      return {
        commandId,
        success: false,
        exitCode: Number.isInteger(error.code) ? error.code : null,
        timedOut,
        durationMs: Math.round(performance.now() - startedAt),
        stdout: error.stdout || '',
        stderr: error.stderr || error.message
      };
    }
  }
}
