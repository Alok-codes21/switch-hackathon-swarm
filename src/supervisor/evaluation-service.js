import { TestRunner } from '../execution/test-runner.js';
import { BenchmarkRunner } from '../execution/benchmark-runner.js';
import { Scorer } from '../evaluation/scorer.js';

export class EvaluationService {
  constructor(repositoryPath = process.cwd()) {
    this.testRunner = new TestRunner(repositoryPath);
    this.benchmarkRunner = new BenchmarkRunner(repositoryPath);
    this.scorer = new Scorer(repositoryPath);
  }

  async evaluate(experiment, options = {}) {
    const experimentId = experiment?.id ?? experiment?.experimentId;

    if (!experimentId || !Array.isArray(experiment.worktrees)) {
      throw new Error('Invalid experiment or missing worktrees.');
    }

    if (experiment.worktrees.length < 2) {
      throw new Error('At least two candidate worktrees are required.');
    }

    const testResults = await this.testRunner.runExperimentTests(
      experiment.worktrees
    );

    const testByAgent = new Map(
      testResults.map(result => [result.agentId, result])
    );

    const passingWorktrees = experiment.worktrees.filter(worktree => {
      const result = testByAgent.get(worktree.agentId);

      const executed = Number(
        result?.testsExecuted ?? result?.total ?? 0
      );

      const failed = Number(
        result?.failed ?? result?.fail ?? 0
      );

      return (
        executed > 0 &&
        failed === 0 &&
        (result?.success === true || result?.testsPassed === true)
      );
    });

    const benchmarkResults = passingWorktrees.length > 0
      ? await this.benchmarkRunner.runExperiment(
          passingWorktrees,
          options
        )
      : [];

    const benchmarkByAgent = new Map(
      benchmarkResults.map(result => [result.agentId, result])
    );

    const candidates = experiment.worktrees.map(worktree => {
      const tests = testByAgent.get(worktree.agentId);
      const benchmark = benchmarkByAgent.get(worktree.agentId);

      const testsExecuted = Number(
        tests?.testsExecuted ?? tests?.total ?? 0
      );

      const passed = Number(
        tests?.passed ?? tests?.pass ?? 0
      );

      const failed = Number(
        tests?.failed ?? tests?.fail ?? 0
      );

      const testsPassed =
        testsExecuted > 0 &&
        failed === 0 &&
        (tests?.success === true || tests?.testsPassed === true);

      return {
        agentId: worktree.agentId,
        testsPassed,
        testsExecuted,
        passed,
        failed,
        benchmarks: benchmark?.success
          ? benchmark.benchmarks
          : [],
        benchmarkError: benchmark?.error ?? null,
        testError: tests?.error ?? null
      };
    });

    return this.scorer.evaluateExperiment(
      experimentId,
      candidates
    );
  }
}
