import { CommandRunner } from './command-runner.js';

export class TestRunner {
  constructor(repositoryPath = process.cwd()) {
    this.commandRunner = new CommandRunner(repositoryPath);
  }

  /**
   * Run the required test suite for one agent.
   */
  async runTests(worktreePath) {
    const result = await this.commandRunner.run(
      'node-tests',
      worktreePath
    );

    // TAP reports the number of tests executed.
    const output = `${result.stdout}\n${result.stderr}`;
    const match = output.match(/^# tests (\d+)$/m);
    const testsExecuted = match ? Number(match[1]) : 0;

    const passedMatch = output.match(/^# pass (\d+)$/m);
    const failedMatch = output.match(/^# fail (\d+)$/m);

    const passed = passedMatch ? Number(passedMatch[1]) : 0;
    const failed = failedMatch ? Number(failedMatch[1]) : 0;

    // A successful process with zero tests is not a successful test run.
    const testsPassed =
      result.success &&
      testsExecuted > 0 &&
      failed === 0 &&
      passed === testsExecuted;

    return {
      success: testsPassed,
      testsPassed,
      testsExecuted,
      passed,
      failed,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      durationMs: result.durationMs,
      stdout: result.stdout,
      stderr: result.stderr
    };
  }

  /**
   * Run tests for all experiment worktrees.
   * A failure in one candidate does not prevent testing another.
   */
  async runExperimentTests(worktrees) {
    if (!Array.isArray(worktrees) || worktrees.length === 0) {
      throw new Error('At least one worktree is required.');
    }

    const results = [];

    for (const worktree of worktrees) {
      try {
        const testResult = await this.runTests(worktree.path);

        results.push({
          agentId: worktree.agentId,
          branch: worktree.branch,
          ...testResult
        });
      } catch (error) {
        results.push({
          agentId: worktree.agentId,
          branch: worktree.branch,
          success: false,
          testsPassed: false,
          testsExecuted: 0,
          passed: 0,
          failed: 0,
          exitCode: null,
          timedOut: false,
          durationMs: 0,
          stdout: '',
          stderr: error.message
        });
      }
    }

    return results;
  }
}
