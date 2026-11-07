export class AgentStatusManager {
  constructor(stateManager) {
    this.stateManager = stateManager;
  }

  async reportStatus(experimentId, agentId, payload) {
    const experiment = await this.stateManager.getExperiment(experimentId);

    if (!experiment) {
      throw new Error('Experiment not found.');
    }

    if (experiment.status !== 'running') {
      throw new Error('Experiment is not accepting agent updates.');
    }

    const worktree = experiment.worktrees.find(
      item => item.agentId === agentId
    );

    if (!worktree) {
      throw new Error('Unknown agent ID.');
    }

    if (!['completed', 'failed'].includes(payload?.status)) {
      throw new Error('Status must be completed or failed.');
    }

    const current = experiment.agentStatuses?.[agentId];

    if (current?.status !== 'pending') {
      throw new Error('This agent has already reported its final status.');
    }

    const agentStatuses = {
      ...experiment.agentStatuses,
      [agentId]: {
        status: payload.status,
        summary: payload.summary || '',
        error: payload.error || '',
        commit: payload.commit || '',
        reportedAt: new Date().toISOString()
      }
    };

    const agentsFinished = experiment.worktrees.every(item =>
      ['completed', 'failed'].includes(
        agentStatuses[item.agentId]?.status
      )
    );

    await this.stateManager.updateExperiment(experimentId, {
      agentStatuses,
      agentsFinished,
      status: agentsFinished ? 'agents_finished' : 'running'
    });

    return {
      success: true,
      experimentId,
      agentId,
      agentStatus: payload.status,
      agentsFinished
    };
  }
}