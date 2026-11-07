import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { StateManager } from '../../src/supervisor/state-manager.js';
import { Scorer } from '../../src/evaluation/scorer.js';

async function createTestExperiment(root) {
  const state = new StateManager(
    path.join(root, 'data', 'experiments.json')
  );

  await state.createExperiment({
    experimentId: 'test-exp-001',
    problem: 'Improve API response time',
    status: 'running',
    agents: [
      { id: 'agent-a' },
      { id: 'agent-b' }
    ]
  });

  return state;
}

test('selects the fastest candidate that passes all tests', async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'swarm-scorer-')
  );

  try {
    await createTestExperiment(root);

    const scorer = new Scorer(root);

    const result = await scorer.evaluateExperiment(
      'test-exp-001',
      [
        {
          agentId: 'agent-a',
          testsPassed: true,
          testsExecuted: 2,
          passed: 2,
          failed: 0,
          benchmarks: [
            { durationMs: 150 },
            { durationMs: 130 }
          ]
        },
        {
          agentId: 'agent-b',
          testsPassed: true,
          testsExecuted: 2,
          passed: 2,
          failed: 0,
          benchmarks: [
            { durationMs: 90 },
            { durationMs: 100 }
          ]
        }
      ]
    );

    assert.equal(result.winner, 'agent-b');
    assert.equal(result.status, 'completed');
    assert.equal(result.requiresHumanApproval, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('never selects a candidate that fails required tests', async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'swarm-scorer-')
  );

  try {
    await createTestExperiment(root);

    const scorer = new Scorer(root);

    const result = await scorer.evaluateExperiment(
      'test-exp-001',
      [
        {
          agentId: 'agent-a',
          testsPassed: false,
          testsExecuted: 2,
          passed: 1,
          failed: 1,
          benchmarks: [
            { durationMs: 10 }
          ]
        },
        {
          agentId: 'agent-b',
          testsPassed: true,
          testsExecuted: 2,
          passed: 2,
          failed: 0,
          benchmarks: [
            { durationMs: 100 }
          ]
        }
      ]
    );

    assert.equal(result.winner, 'agent-b');
    assert.equal(
      result.candidates.find(c => c.agentId === 'agent-a').eligible,
      false
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('returns no winner when every candidate fails', async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'swarm-scorer-')
  );

  try {
    await createTestExperiment(root);

    const scorer = new Scorer(root);

    const result = await scorer.evaluateExperiment(
      'test-exp-001',
      [
        {
          agentId: 'agent-a',
          testsPassed: false,
          testsExecuted: 2,
          passed: 1,
          failed: 1,
          benchmarks: [{ durationMs: 50 }]
        },
        {
          agentId: 'agent-b',
          testsPassed: false,
          testsExecuted: 2,
          passed: 0,
          failed: 2,
          benchmarks: [{ durationMs: 20 }]
        }
      ]
    );

    assert.equal(result.winner, null);
    assert.equal(result.requiresHumanApproval, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
