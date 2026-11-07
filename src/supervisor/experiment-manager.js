
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

import { StateManager } from './state-manager.js';
import { WorktreeManager } from '../git/worktree-manager.js';
import { TestRunner } from '../execution/test-runner.js';
import { Scorer } from '../evaluation/scorer.js';

const execFileAsync = promisify(execFile);

export class ExperimentManager {
  constructor(repositoryPath = process.cwd()) {
    this.repositoryPath = path.resolve(repositoryPath);

    this.stateManager = new StateManager(
      path.join(this.repositoryPath, 'data', 'experiments.json')
    );

    this.worktreeManager = new WorktreeManager(this.repositoryPath);
    this.testRunner = new TestRunner(this.repositoryPath);
    this.scorer = new Scorer(this.repositoryPath);
  }

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

    const existing = await this.stateManager.getExperiment(experimentId);

    if (existing) {
      throw new Error(`Experiment "${experimentId}" already exists.`);
    }

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
      agentStatuses: Object.fromEntries(
        worktreeResult.worktrees.map(worktree => [
          worktree.agentId,
          { status: 'pending' }
        ])
      ),
      agentsFinished: false,
      candidates: [],
      testResults: [],
      winner: null,
      requiresHumanApproval: true
    };

    try {
      await this.stateManager.createExperiment(record);
    } catch (error) {
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
      testResults: experiment.testResults || [],
      worktrees: experiment.worktrees || [],
      evaluatedAt: experiment.evaluatedAt || null,
      requiresHumanApproval: experiment.requiresHumanApproval ?? true,
      agentStatuses: experiment.agentStatuses || {},
      agentsFinished: experiment.agentsFinished ?? false,
    };
  }

  async listExperiments() {
    return this.stateManager.listExperiments();
  }

  /**
   * Run the allowlisted test suite in every candidate worktree,
   * then save the evaluation results.
   *
   * No benchmark is fabricated. Until a benchmark command is
   * configured, candidates cannot be selected as a winner.
   */
  async evaluateExperiment(experimentId) {
    const experiment = await this.stateManager.getExperiment(experimentId);

    if (!experiment) {
      throw new Error(`Experiment "${experimentId}" was not found.`);
    }
    const allAgentsFinished = experiment.worktrees?.every(worktree =>
      ['completed', 'failed'].includes(
        experiment.agentStatuses?.[worktree.agentId]?.status
      )
    );

    if (!allAgentsFinished) {
      throw new Error(
        'Cannot evaluate until every assigned agent has reported completion or failure.'
      );
    }

    if (!['running', 'agents_finished', 'awaiting_benchmark'].includes(experiment.status)) {
      throw new Error(
        `Cannot evaluate an experiment with status "${experiment.status}".`
      );
    }

    if (!Array.isArray(experiment.worktrees) ||
      experiment.worktrees.length === 0) {
      throw new Error('This experiment has no worktrees to evaluate.');
    }

    await this.stateManager.updateExperiment(experimentId, {
      status: 'evaluating',
      evaluationStartedAt: new Date().toISOString()
    });

    try {
      const testResults = await this.testRunner.runExperimentTests(
        experiment.worktrees
      );

      const candidateRuns = testResults.map(result => ({
        agentId: result.agentId,
        testsPassed: result.testsPassed,
        testsExecuted: result.testsExecuted,
        passed: result.passed,
        failed: result.failed,
        benchmarks: []
      }));

      const evaluation = await this.scorer.evaluateExperiment(
        experimentId,
        candidateRuns
      );

      await this.stateManager.updateExperiment(experimentId, {
        testResults,
        evaluationCompletedAt: new Date().toISOString()
      });

      return {
        ...evaluation,
        testResults,
        benchmarkStatus: 'not_configured',
        message: evaluation.status === 'awaiting_benchmark'
          ? 'Tests completed. Waiting for benchmark measurements before selecting a winner.'
          : 'Evaluation completed.',
        requiresHumanApproval: true
      };
    } catch (error) {
      const latest = await this.stateManager.getExperiment(experimentId);

      // Restore running status only if scoring did not already complete.
      if (latest?.status === 'evaluating') {
        await this.stateManager.updateExperiment(experimentId, {
          status: 'running',
          evaluationError: error.message
        });
      }

      throw error;
    }
  }

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

    if (experiment.status === 'evaluating') {
      throw new Error('Cannot cancel an experiment while evaluation is running.');
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
          cleanupErrors.push(
            `Worktree removed; branch ${worktree.branch} was retained: ${error.message}`
          );
        }
      } catch (error) {
        cleanupErrors.push(`${worktree.agentId}: ${error.message}`);
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
