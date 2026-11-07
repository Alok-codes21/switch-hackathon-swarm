import test from 'node:test';
import assert from 'node:assert/strict';
import { PromotionManager } from '../../src/git/promotion-manager.js';

function createManager(experiment) {
  const stateManager = {
    async get() {
      return experiment;
    }
  };

  return new PromotionManager(process.cwd(), stateManager);
}

test('rejects promotion without human approval', async () => {
  const manager = createManager({
    id: 'exp-test',
    status: 'completed',
    winner: 'agent-a',
    candidates: [
      { agentId: 'agent-a', testsPassed: true }
    ],
    worktrees: []
  });

  await assert.rejects(
    manager.promoteCandidate('exp-test', 'agent-a', ''),
  );
});

test('rejects promotion when experiment is not completed', async () => {
  const manager = createManager({
    id: 'exp-test',
    status: 'running',
    winner: 'agent-a',
    candidates: [
      { agentId: 'agent-a', testsPassed: true }
    ],
    worktrees: []
  });

  await assert.rejects(
    manager.promoteCandidate('exp-test', 'agent-a', 'human-reviewer')
  );
});

test('rejects promotion of a candidate that is not the winner', async () => {
  const manager = createManager({
    id: 'exp-test',
    status: 'completed',
    winner: 'agent-a',
    candidates: [
      { agentId: 'agent-a', testsPassed: true },
      { agentId: 'agent-b', testsPassed: true }
    ],
    worktrees: []
  });

  await assert.rejects(
    manager.promoteCandidate('exp-test', 'agent-b', 'human-reviewer')
  );
});

test('rejects promotion when the winning candidate failed tests', async () => {
  const manager = createManager({
    id: 'exp-test',
    status: 'completed',
    winner: 'agent-a',
    candidates: [
      { agentId: 'agent-a', testsPassed: false }
    ],
    worktrees: []
  });

  await assert.rejects(
    manager.promoteCandidate('exp-test', 'agent-a', 'human-reviewer')
  );
});

test('rejects promotion when experiment does not exist', async () => {
  const manager = createManager(null);

  await assert.rejects(
    manager.promoteCandidate('missing-experiment', 'agent-a', 'human-reviewer')
  );
});
