import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);

export class PromotionManager {
  constructor(repositoryPath, stateManager) {
    this.repositoryPath = path.resolve(repositoryPath);
    this.stateManager = stateManager;
  }

  async #git(args) {
    try {
      const { stdout } = await execFileAsync('git', args, {
        cwd: this.repositoryPath,
        windowsHide: true,
        timeout: 30000,
        maxBuffer: 5 * 1024 * 1024
      });

      return stdout.trim();
    } catch (error) {
      throw new Error(
        `Git operation failed: ${error.stderr?.trim() || error.message}`
      );
    }
  }

  async promoteCandidate(experimentId, agentId, approvedBy) {
    if (!approvedBy || typeof approvedBy !== 'string' || !approvedBy.trim()) {
      throw new Error('A human approver identity is required.');
    }

    const experiment = await this.stateManager.getExperiment(experimentId);

    if (!experiment) {
      throw new Error('Experiment not found.');
    }

    if (experiment.status !== 'completed') {
      throw new Error('Experiment must be completed before promotion.');
    }

    if (experiment.winner !== agentId) {
      throw new Error('Only the evaluated winning candidate can be promoted.');
    }

    const candidate = (experiment.candidates || []).find(
      item => item.agentId === agentId
    );

    if (!candidate || candidate.testsPassed !== true) {
      throw new Error('Candidate has not passed all required tests.');
    }

    const worktree = (experiment.worktrees || []).find(
      item => item.agentId === agentId
    );

    if (!worktree) {
      throw new Error('Candidate worktree was not found.');
    }

    const expectedBranch = `experiment/${experimentId}-${agentId}`;

    if (worktree.branch !== expectedBranch) {
      throw new Error('Candidate branch does not match the expected experiment branch.');
    }

    // Never merge over uncommitted changes in the main repository.
    const dirty = await this.#git([
      'status',
      '--porcelain',
      '--untracked-files=all'
    ]);

    if (dirty) {
      throw new Error('Main repository is not clean. Commit or safely stash changes first.');
    }

    const currentBranch = await this.#git([
      'branch',
      '--show-current'
    ]);

    if (currentBranch !== experiment.baseBranch) {
      throw new Error(
        `Switch to the original base branch "${experiment.baseBranch}" before promotion.`
      );
    }

    const currentCommit = await this.#git(['rev-parse', 'HEAD']);

    if (currentCommit !== experiment.baseCommit) {
      throw new Error(
        'Base branch has changed since the experiment started. Re-evaluate before promotion.'
      );
    }

    // Confirm the candidate branch exists before merging.
    await this.#git([
      'show-ref',
      '--verify',
      `refs/heads/${expectedBranch}`
    ]);

    try {
      await this.#git([
        'merge',
        '--no-ff',
        '--no-edit',
        expectedBranch
      ]);
    } catch (error) {
      // If a merge conflict began, abort rather than leaving a half-merge.
      try {
        await this.#git(['merge', '--abort']);
      } catch {
        // Preserve the original merge error.
      }

      throw new Error(`Promotion failed; no automatic conflict resolution was attempted. ${error.message}`);
    }

    const promotedCommit = await this.#git(['rev-parse', 'HEAD']);

    await this.stateManager.updateExperiment(experimentId, {
      status: 'promoted',
      promotedCandidate: agentId,
      approvedBy: approvedBy.trim(),
      promotedAt: new Date().toISOString(),
      promotedCommit,
      requiresHumanApproval: false
    });

    return {
      success: true,
      experimentId,
      agentId,
      branch: expectedBranch,
      approvedBy: approvedBy.trim(),
      promotedCommit
    };
  }
}
