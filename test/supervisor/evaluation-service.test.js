import test from 'node:test';
import assert from 'node:assert/strict';

import { EvaluationService } from '../../src/supervisor/evaluation-service.js';

function createService(testResults, benchmarkResults) {
  const service = new EvaluationService(process.cwd());

  let scoredCandidates = null;
  let benchmarkedAgents = [];

  service.testRunner = {
    async runExperimentTests() {
      return testResults;
    }
  };

  service.benchmarkRunner = {
    async runExperiment(worktrees) {
      benchmarkedAgents = worktrees.map(item => item.agentId);
      return benchmarkResults;
    }
  };

  service.scorer = {
    async evaluateExperiment(experimentId, candidates) {
      scoredCandidates = candidates;

      return {
        experimentId,
        status: 'completed',
        candidates,
        winner: candidates.find(candidate => candidate.testsPassed)?.agentId ?? null,
        requiresHumanApproval: true
      };
    }
  };

  return {
    service,
    getScoredCandidates: () => scoredCandidates,
    getBenchmarkedAgents: () => benchmarkedAgents
  };
}

const experiment = {
  id: 'evaluation-test',
  worktrees: [
    { agentId: 'agent-a', path: '.worktrees/agent-a' },
    { agentId: 'agent-b', path: '.worktrees/agent-b' }
  ]
};

test('benchmarks only candidates whose tests pass', async () => {
  const setup = createService(
    [
      {
        agentId: 'agent-a',
        success: true,
        testsPassed: true,
        testsExecuted: 10,
        passed: 10,
        failed: 0
      },
      {
        agentId: 'agent-b',
        success: false,
        testsPassed: false,
        testsExecuted: 10,
        passed: 8,
        failed: 2
      }
    ],
    [
      {
        agentId: 'agent-a',
        success: true,
        benchmarks: [{ run: 1, durationMs: 25 }]
      }
    ]
  );

  await setup.service.evaluate(experiment);

  assert.deepEqual(setup.getBenchmarkedAgents(), ['agent-a']);

  const candidates = setup.getScoredCandidates();

  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].testsPassed, true);
  assert.equal(candidates[1].testsPassed, false);
});

test('does not benchmark when all candidates fail tests', async () => {
  const setup = createService(
    [
      {
        agentId: 'agent-a',
        success: false,
        testsExecuted: 5,
        passed: 3,
        failed: 2
      },
      {
        agentId: 'agent-b',
        success: false,
        testsExecuted: 5,
        passed: 4,
        failed: 1
      }
    ],
    []
  );

  await setup.service.evaluate(experiment);

  assert.deepEqual(setup.getBenchmarkedAgents(), []);

  const candidates = setup.getScoredCandidates();

  assert.equal(candidates.length, 2);
  assert.equal(candidates.every(item => !item.testsPassed), true);
});

test('rejects an experiment without valid worktrees', async () => {
  const setup = createService([], []);

  await assert.rejects(
    setup.service.evaluate({ id: 'invalid', worktrees: [] }),
    /At least two candidate worktrees/
  );
});
