
import { CommandRunner } from './command-runner.js';

function parseTapResults(output) {
  const tests = output.match(/^# tests\s+(\d+)/m);
  const passed = output.match(/^# pass\s+(\d+)/m);
  const failed = output.match(/^# fail\s+(\d+)/m);

  return {
    testsExecuted: tests ? Number(tests[1]) : 0,
    passed: passed ? Number(passed[1]) : 0,
    failed: failed ? Number(failed[1]) : 0
  };
}

export class TestRunner {
  constructor(repositoryPath = process.cwd()) {
    this.commandRunner = new CommandRunner(repositoryPath);
    this.commandId = 'node-tests';
  }

  async runAgent(agentId, worktreePath) {
    try {
      const result = await this.commandRunner.run(
        this.commandId,
        worktreePath
      );

      const output = `${result.stdout || ''}\n${result.stderr || ''}`;
      const counts = parseTapResults(output);

      const success =
        result.success === true &&
        counts.testsExecuted > 0 &&
        counts.failed === 0;

      return {
        agentId,
        success,
        testsPassed: success,
        ...counts,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        error: success
          ? null
          : result.stderr || (
              counts.testsExecuted === 0
                ? 'No test results were detected.'
                : 'One or more tests failed.'
            )
      };
    } catch (error) {
      return {
        agentId,
        success: false,
        testsPassed: false,
        testsExecuted: 0,
        passed: 0,
        failed: 0,
        stdout: '',
        stderr: '',
        error: error.message
      };
    }
  }

  async runExperimentTests(worktrees) {
    if (!Array.isArray(worktrees) || worktrees.length < 2) {
      throw new Error('At least two candidate worktrees are required.');
    }

    const results = [];

    for (const worktree of worktrees) {
      if (!worktree.agentId || !worktree.path) {
        results.push({
          agentId: worktree.agentId ?? 'unknown',
          success: false,
          testsPassed: false,
          testsExecuted: 0,
          passed: 0,
          failed: 0,
          error: 'Invalid worktree information.'
        });

        continue;
      }

      results.push(
        await this.runAgent(worktree.agentId, worktree.path)
      );
    }

    return results;
  }
}
