import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

import { StateManager } from './state-manager.js';
import { WorktreeManager } from '../git/worktree-manager.js';

const execFileAsync = promisify(execFile);

export class ExperimentManager {
  constructor(repositoryPath = process.cwd()) {
    this.repositoryPath = path.resolve(repositoryPath);

    this.stateManager = new StateManager(
      path.join(this.repositoryPath, 'data', 'experiments.json')
    );

    this.worktreeManager = new WorktreeManager(this.repositoryPath);
  }

  /**
   * Start an experiment and create one worktree per agent.
   *
   * Expected request:
   * {
   *   experimentId: "exp-001",
   *   problem: "API response time is 4 seconds",
   *   agents: [
   *     { id: "agent-a", hypothesis: "Try caching" },
   *     { id: "agent-b", hypothesis: "Optimize database queries" }
   *   ]
   * }
   */
  async startExperiment(payload) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('A valid experiment request is required.');
    }

    const { experimentId, problem, agents } = payload;

    if (!experimentId || typeof experimentId !== 'string') {
      throw new Error('experimentId is required.');
    }

    if (!problem || typeof problem !== 'string' || !problem.trim()) {
      throw new Error('A problem description is required.');
    }

    if (!Array.isArray(agents) || agents.length < 2) {
      throw new Error('At least two agents are required for an experiment.');
    }

    // Prevent duplicate experiments before creating Git branches.
    const existing = await this.stateManager.getExperiment(experimentId);

    if (existing) {
      throw new Error(`Experiment "${experimentId}" already exists.`);
    }

    // Create isolated worktrees for all agents.
    const worktreeResult = await this.worktreeManager.createWorktrees({
      experimentId,
      agents
    });

    const record = {
      experimentId,
      problem: problem.trim(),
      status: 'running',
      baseBranch: worktreeResult.baseBranch,
      baseCommit: worktreeResult.baseCommit,
      repositoryPath: worktreeResult.repositoryPath,
      agents: agents.map(agent => ({
        id: agent.id,
        hypothesis: agent.hypothesis || ''
      })),
      worktrees: worktreeResult.worktrees,
      candidates: [],
      winner: null,
      requiresHumanApproval: true
    };

    try {
      await this.stateManager.createExperiment(record);
    } catch (error) {
      // If state saving fails, remove only the worktrees we just created.
      for (const worktree of [...worktreeResult.worktrees].reverse()) {
        try {
          await this.worktreeManager.removeWorktree(worktree.path);

          await execFileAsync(
            'git',
            ['branch', '-d', worktree.branch],
            {
              cwd: this.repositoryPath,
              windowsHide: true,
              timeout: 15000
            }
          );
        } catch {
          // Preserve the original state-saving error.
        }
      }

      throw error;
    }

    // This is the response expected by Person 1's SwitchAgentBridge.
    return {
      experimentId,
      status: 'running',
      worktrees: worktreeResult.worktrees.map(worktree => ({
        agentId: worktree.agentId,
        branch: worktree.branch,
        path: worktree.path
      }))
    };
  }

  /**
   * Return experiment status.
   */
  async getExperiment(experimentId) {
    const experiment = await this.stateManager.getExperiment(experimentId);

    if (!experiment) {
      return null;
    }

    return {
      experimentId: experiment.experimentId,
      problem: experiment.problem,
      status: experiment.status,
      winner: experiment.winner,
      candidates: experiment.candidates || [],
      worktrees: experiment.worktrees || [],
      requiresHumanApproval: experiment.requiresHumanApproval ?? true
    };
  }

  /**
   * List all experiments.
   */
  async listExperiments() {
    return this.stateManager.listExperiments();
  }

  /**
   * Cancel an experiment and safely remove its worktrees.
   *
   * Git refuses to remove worktrees containing uncommitted changes.
   * We deliberately do not force-delete them.
   */
  async cancelExperiment(experimentId) {
    const experiment = await this.stateManager.getExperiment(experimentId);

    if (!experiment) {
      throw new Error(`Experiment "${experimentId}" was not found.`);
    }

    if (experiment.status === 'cancelled') {
      return {
        success: true,
        experimentId,
        status: 'cancelled'
      };
    }

    const cleanupErrors = [];

    for (const worktree of [...(experiment.worktrees || [])].reverse()) {
      try {
        await this.worktreeManager.removeWorktree(worktree.path);

        try {
          await execFileAsync(
            'git',
            ['branch', '-d', worktree.branch],
            {
              cwd: this.repositoryPath,
              windowsHide: true,
              timeout: 15000
            }
          );
        } catch (error) {
          // Worktree is removed, but preserve any branch that Git
          // refuses to delete because it contains unmerged commits.
          cleanupErrors.push(
            `Worktree removed; branch ${worktree.branch} was retained: ${error.message}`
          );
        }
      } catch (error) {
        cleanupErrors.push(
          `${worktree.agentId}: ${error.message}`
        );
      }
    }

    if (cleanupErrors.length > 0) {
      await this.stateManager.updateExperiment(experimentId, {
        status: 'cleanup_failed',
        cleanupErrors
      });

      return {
        success: false,
        experimentId,
        status: 'cleanup_failed',
        errors: cleanupErrors
      };
    }

    await this.stateManager.updateExperiment(experimentId, {
      status: 'cancelled',
      worktrees: []
    });

    return {
      success: true,
      experimentId,
      status: 'cancelled'
    };
  }
}
