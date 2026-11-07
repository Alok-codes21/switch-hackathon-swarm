import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  mkdir,
  realpath,
  stat
} from 'node:fs/promises';
import path from 'node:path';

const execFileAsync = promisify(execFile);

export class WorktreeManager {
  constructor(repositoryPath = process.cwd()) {
    this.repositoryPath = path.resolve(repositoryPath);
    this.worktreeDirectory = '.worktrees';
  }

  /**
   * Run Git safely without invoking a shell.
   */
  async #git(args, cwd = this.repositoryPath) {
    try {
      const { stdout, stderr } = await execFileAsync('git', args, {
        cwd,
        windowsHide: true,
        timeout: 30000,
        maxBuffer: 5 * 1024 * 1024
      });

      return {
        stdout: stdout.trim(),
        stderr: stderr.trim()
      };
    } catch (error) {
      const details = error.stderr?.trim() || error.message;
      throw new Error(`Git command failed: ${details}`);
    }
  }

  #validateIdentifier(value, label) {
    if (
      typeof value !== 'string' ||
      !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,49}$/.test(value)
    ) {
      throw new Error(
        `${label} must contain only letters, numbers, hyphens, or underscores.`
      );
    }
  }

  /**
   * Verify that the repository exists and has no uncommitted changes.
   * We refuse to create experiments from a dirty working tree.
   */
  async verifyRepository() {
    const rootResult = await this.#git([
      'rev-parse',
      '--show-toplevel'
    ]);

    const actualRoot = await realpath(rootResult.stdout);
    const configuredRoot = await realpath(this.repositoryPath);

    if (actualRoot !== configuredRoot) {
      throw new Error(
        `Configured path is not the Git repository root. Git root: ${actualRoot}`
      );
    }

    const status = await this.#git([
      'status',
      '--porcelain',
      '--untracked-files=all'
    ]);

    if (status.stdout) {
      throw new Error(
        'Repository has uncommitted or untracked changes. Commit or safely stash them before creating worktrees.'
      );
    }

    const branch = await this.#git([
      'branch',
      '--show-current'
    ]);

    const commit = await this.#git([
      'rev-parse',
      'HEAD'
    ]);

    return {
      repositoryPath: actualRoot,
      branch: branch.stdout,
      commit: commit.stdout,
      clean: true
    };
  }

  /**
   * Create one isolated Git worktree per agent.
   *
   * agents example:
   * [
   *   { id: 'agent-a', hypothesis: 'Try caching' },
   *   { id: 'agent-b', hypothesis: 'Optimize database queries' }
   * ]
   */
  async createWorktrees({
    experimentId,
    agents,
    baseRef = 'HEAD'
  }) {
    this.#validateIdentifier(experimentId, 'experimentId');

    if (!Array.isArray(agents) || agents.length === 0) {
      throw new Error('At least one agent is required.');
    }

    const agentIds = new Set();

    for (const agent of agents) {
      this.#validateIdentifier(agent?.id, 'agent id');

      if (agentIds.has(agent.id)) {
        throw new Error(`Duplicate agent id: ${agent.id}`);
      }

      agentIds.add(agent.id);
    }

    // Never create worktrees from a repository with uncommitted work.
    const repository = await this.verifyRepository();

    // Resolve the starting commit before creating any branches.
    const baseCommit = await this.#git([
      'rev-parse',
      '--verify',
      `${baseRef}^{commit}`
    ]);

    const worktreeRoot = path.resolve(
      repository.repositoryPath,
      this.worktreeDirectory
    );

    await mkdir(worktreeRoot, { recursive: true });

    const created = [];

    try {
      for (const agent of agents) {
        const branch = `experiment/${experimentId}-${agent.id}`;
        const worktreePath = path.resolve(
          worktreeRoot,
          `${experimentId}-${agent.id}`
        );

        // Confirm the generated path remains inside .worktrees.
        const relativePath = path.relative(worktreeRoot, worktreePath);

        if (
          relativePath.startsWith('..') ||
          path.isAbsolute(relativePath)
        ) {
          throw new Error('Unsafe worktree path generated.');
        }

        // Do not overwrite an existing directory.
        try {
          await stat(worktreePath);
          throw new Error(
            `Worktree path already exists: ${worktreePath}`
          );
        } catch (error) {
          if (error.code !== 'ENOENT') {
            throw error;
          }
        }

        // Creates a new branch from the same starting commit.
        await this.#git([
          'worktree',
          'add',
          '-b',
          branch,
          worktreePath,
          baseCommit.stdout
        ]);

        created.push({
          agentId: agent.id,
          hypothesis: agent.hypothesis || '',
          branch,
          path: worktreePath,
          status: 'created',
          baseCommit: baseCommit.stdout
        });
      }

      return {
        experimentId,
        repositoryPath: repository.repositoryPath,
        baseBranch: repository.branch,
        baseCommit: baseCommit.stdout,
        worktrees: created
      };
    } catch (error) {
      // Roll back only worktrees created by this call.
      for (const worktree of created.reverse()) {
        try {
          await this.#git([
            'worktree',
            'remove',
            worktree.path
          ]);
        } catch {
          // Preserve the original error. Manual cleanup may be needed.
        }

        try {
          await this.#git([
            'branch',
            '-D',
            worktree.branch
          ]);
        } catch {
          // Do not hide the original failure.
        }
      }

      throw error;
    }
  }

  /**
   * Remove a worktree only if Git considers it safe to remove.
   * This intentionally does not use --force.
   */
  async removeWorktree(worktreePath) {
    const absolutePath = path.resolve(worktreePath);
    const worktreeRoot = path.resolve(
      this.repositoryPath,
      this.worktreeDirectory
    );

    const relativePath = path.relative(worktreeRoot, absolutePath);

    if (
      !relativePath ||
      relativePath.startsWith('..') ||
      path.isAbsolute(relativePath)
    ) {
      throw new Error('Refusing to remove a path outside the worktree directory.');
    }

    await this.#git([
      'worktree',
      'remove',
      absolutePath
    ]);

    return {
      success: true,
      path: absolutePath
    };
  }

  /**
   * List Git's registered worktrees.
   */
  async listWorktrees() {
    const result = await this.#git([
      'worktree',
      'list',
      '--porcelain'
    ]);

    return result.stdout;
  }
}
