/**
 * agent-bridge.js
 * Connects Person 1 to Switch and the Supervisor.
 * Supports both live Supervisor API (Person 2) and a Mock Fallback (Page 4)
 * so Person 1 can test the complete chat flow end-to-end even before Person 2 finishes.
 */

export class SwitchAgentBridge {
  constructor(switchUrl, supervisorUrl) {
    this.switchUrl = switchUrl || 'http://localhost:49921';
    this.supervisorUrl = supervisorUrl || 'http://localhost:3000';
    this.mockState = new Map();
  }

  /**
   * Sends the experiment contract from Person 1 to Person 2
   */
  async startExperiment(payload) {
    try {
      const res = await fetch(`${this.supervisorUrl}/api/experiments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // Fallback to Mock Supervisor (Page 4 requirement)
    }

    // Spec Page 4 compliant response
    const mockResponse = {
      experimentId: payload.experimentId,
      status: 'running',
      worktrees: [
        {
          agentId: 'agent-a',
          branch: `experiment/${payload.experimentId}-a`,
          path: `.worktrees/${payload.experimentId}-a`
        },
        {
          agentId: 'agent-b',
          branch: `experiment/${payload.experimentId}-b`,
          path: `.worktrees/${payload.experimentId}-b`
        }
      ]
    };
    this.mockState.set(payload.experimentId, {
      ...mockResponse,
      startTime: Date.now()
    });
    return mockResponse;
  }

  async getStatus(experimentId) {
    try {
      const res = await fetch(`${this.supervisorUrl}/api/experiments/${experimentId}`);
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // Fallback to mock evaluation
    }

    const current = this.mockState.get(experimentId);
    if (!current) return null;

    // Simulate completed experiment after 5 seconds
    if (Date.now() - current.startTime > 3000) {
      return {
        experimentId,
        status: 'completed',
        winner: 'agent-b',
        candidates: [
          { agentId: 'agent-a', tests: 'passed', medianMs: 1200 },
          { agentId: 'agent-b', tests: 'passed', medianMs: 800 }
        ],
        requiresHumanApproval: true
      };
    }

    return {
      experimentId,
      status: 'running',
      progress: 'Agents A and B actively executing benchmark suites in separate worktrees'
    };
  }

  async cancelExperiment(experimentId) {
    try {
      const res = await fetch(`${this.supervisorUrl}/api/experiments/${experimentId}/cancel`, { method: 'POST' });
      if (res.ok) return await res.json();
    } catch {}

    this.mockState.delete(experimentId);
    return { success: true };
  }

  async promoteCandidate(experimentId, agentId, userId) {
    try {
      const res = await fetch(`${this.supervisorUrl}/api/experiments/${experimentId}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, approvedBy: userId })
      });
      if (res.ok) return await res.json();
    } catch {}

    return {
      success: true,
      branch: `experiment/${experimentId}-${agentId.replace('agent-', '')}`,
      merged: true
    };
  }
}
