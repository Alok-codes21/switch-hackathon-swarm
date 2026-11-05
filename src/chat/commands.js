/**
 * commands.js
 * Implements the Person 1 chat commands according to the Hackathon specification:
 * - /experiment <problem description>
 * - /status [experimentId]
 * - /cancel <experimentId>
 * - /promote <experimentId> <agentId>
 */

export class CommandHandler {
  constructor(supervisorBridge, switchBridge) {
    this.supervisor = supervisorBridge;
    this.switchBridge = switchBridge;
  }

  /**
   * Handles user input from the chat room
   * @param {string} rawMessage - text entered by user
   * @param {string} userId - id of the user sending the command
   * @returns {Promise<string>} response to post back to chat
   */
  async handleMessage(rawMessage, userId = 'user') {
    const trimmed = rawMessage.trim();

    if (trimmed.startsWith('/experiment')) {
      const problem = trimmed.replace('/experiment', '').trim();
      if (!problem) {
        return '❌ **Usage:** `/experiment <problem description>`\n*Example:* `/experiment API response time is 4 seconds. Optimize it.`';
      }
      return await this.handleExperimentCommand(problem);
    }

    if (trimmed.startsWith('/status')) {
      const expId = trimmed.replace('/status', '').trim() || null;
      return await this.handleStatusCommand(expId);
    }

    if (trimmed.startsWith('/cancel')) {
      const expId = trimmed.replace('/cancel', '').trim();
      if (!expId) {
        return '❌ **Usage:** `/cancel <experimentId>`';
      }
      return await this.handleCancelCommand(expId);
    }

    if (trimmed.startsWith('/promote')) {
      const parts = trimmed.replace('/promote', '').trim().split(/\s+/);
      const expId = parts[0];
      const agentId = parts[1];
      if (!expId || !agentId) {
        return '❌ **Usage:** `/promote <experimentId> <agentId>`\n*Example:* `/promote exp-001 agent-b`';
      }
      return await this.handlePromoteCommand(expId, agentId, userId);
    }

    return null; // Not a recognized command
  }

  async handleExperimentCommand(problem) {
    const experimentId = `exp-${Date.now().toString().slice(-4)}`;

    // Page 4: Agreed JSON format from Person 1 -> Person 2
    const requestPayload = {
      experimentId,
      problem,
      agents: [
        { id: 'agent-a', hypothesis: 'caching' },
        { id: 'agent-b', hypothesis: 'database query optimization' }
      ]
    };

    const initialReport = [
      `🧪 **Experiment Started: \`${experimentId}\`**`,
      `**Problem:** "${problem}"`,
      `**Assigned Agents:**`,
      `  • **Agent A:** Testing caching hypothesis`,
      `  • **Agent B:** Testing database query optimization hypothesis`,
      `⏳ Initializing Git worktrees...`
    ].join('\n');

    // Send payload to Person 2 supervisor
    const supervisorRes = await this.supervisor.startExperiment(requestPayload);

    let worktreeDetails = '';
    if (supervisorRes.worktrees) {
      worktreeDetails = supervisorRes.worktrees
        .map(w => `  • \`${w.agentId}\` working on branch \`${w.branch}\` in \`${w.path}\``)
        .join('\n');
    }

    return `${initialReport}\n\n📂 **Worktrees Active:**\n${worktreeDetails}\n\n*Agents are now developing solutions. Use \`/status ${experimentId}\` to inspect progress.*`;
  }

  async handleStatusCommand(experimentId) {
    const status = await this.supervisor.getStatus(experimentId);
    if (!status) {
      return `⚠️ No active experiment found with ID \`${experimentId}\`.`;
    }

    if (status.winner) {
      const candidates = (status.candidates || [])
        .map(c => `  • **${c.agentId}:** Tests: **${c.tests}** | Median: **${c.medianMs}ms**`)
        .join('\n');

      return [
        `📊 **Experiment Complete: \`${status.experimentId}\`**`,
        `**Evaluation Results:**`,
        candidates,
        `🏆 **Recommended Winner:** \`${status.winner}\``,
        `⚠️ **Human Approval Required:** To approve and merge this solution, run:`,
        `\`/promote ${status.experimentId} ${status.winner}\``
      ].join('\n');
    }

    return `⏳ **Experiment \`${status.experimentId}\` Status:** \`${status.status}\` (${status.progress || 'Agents working...'})`;
  }

  async handleCancelCommand(experimentId) {
    const res = await this.supervisor.cancelExperiment(experimentId);
    return `🛑 Experiment \`${experimentId}\` has been cancelled. Temporary worktrees cleaned up.`;
  }

  async handlePromoteCommand(experimentId, agentId, userId) {
    const res = await this.supervisor.promoteCandidate(experimentId, agentId, userId);
    if (res.error) {
      return `❌ Promotion failed: ${res.error}`;
    }
    return [
      `✅ **Promotion Approved by ${userId}!**`,
      `Branch \`${res.branch || `experiment/${agentId}`}\` has been safely merged into \`main\`.`,
      `🧹 Worktrees cleaned up successfully.`
    ].join('\n');
  }
}
