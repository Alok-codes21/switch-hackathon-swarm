
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { AgentStatusManager } from '../../src/supervisor/agent-status-manager.js';

function createFixture() {
  let experiment = {
    experimentId: 'exp-test',
    status: 'running',
    agentsFinished: false,
    worktrees: [
      { agentId: 'agent-a' },
      { agentId: 'agent-b' }
    ],
    agentStatuses: {
      'agent-a': { status: 'pending' },
      'agent-b': { status: 'pending' }
    }
  };

  const stateManager = {
    async getExperiment(id) {
      return id === 'exp-test' ? structuredClone(experiment) : null;
    },

    async updateExperiment(id, updates) {
      if (id !== 'exp-test') {
        throw new Error('Experiment not found.');
      }

      experiment = { ...experiment, ...updates };
      return structuredClone(experiment);
    }
  };

  return {
    manager: new AgentStatusManager(stateManager),
    getExperiment: () => structuredClone(experiment)
  };
}

describe('AgentStatusManager', () => {
  it('records a completed agent', async () => {
    const { manager, getExperiment } = createFixture();

    const result = await manager.reportStatus('exp-test', 'agent-a', {
      status: 'completed',
      summary: 'Implemented caching'
    });

    assert.equal(result.success, true);
    assert.equal(result.agentStatus, 'completed');
    assert.equal(result.agentsFinished, false);
    assert.equal(getExperiment().agentStatuses['agent-a'].summary,
      'Implemented caching');
  });

  it('marks the experiment finished after every agent reports', async () => {
    const { manager, getExperiment } = createFixture();

    await manager.reportStatus('exp-test', 'agent-a', {
      status: 'completed'
    });

    const result = await manager.reportStatus('exp-test', 'agent-b', {
      status: 'failed',
      error: 'Agent timed out'
    });

    assert.equal(result.agentsFinished, true);
    assert.equal(getExperiment().status, 'agents_finished');
    assert.equal(getExperiment().agentsFinished, true);
  });

  it('rejects an unknown agent', async () => {
    const { manager } = createFixture();

    await assert.rejects(
      manager.reportStatus('exp-test', 'agent-unknown', {
        status: 'completed'
      }),
      /Unknown agent ID/
    );
  });

  it('rejects duplicate final reports', async () => {
    const { manager } = createFixture();

    await manager.reportStatus('exp-test', 'agent-a', {
      status: 'completed'
    });

    await assert.rejects(
      manager.reportStatus('exp-test', 'agent-a', {
        status: 'failed'
      }),
      /already reported/
    );
  });

  it('rejects invalid statuses', async () => {
    const { manager } = createFixture();

    await assert.rejects(
      manager.reportStatus('exp-test', 'agent-a', {
        status: 'running'
      }),
      /Status must be completed or failed/
    );
  });

  it('rejects reports for missing experiments', async () => {
    const { manager } = createFixture();

    await assert.rejects(
      manager.reportStatus('missing', 'agent-a', {
        status: 'completed'
      }),
      /Experiment not found/
    );
  });
});
