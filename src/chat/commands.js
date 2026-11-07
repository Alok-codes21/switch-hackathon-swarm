/**
 * commands.js
 * Implements the Person 1 chat commands according to the Hackathon specification:
 * - /experiment <problem description>
 * - /status [experimentId]
 * - /cancel <experimentId>
 * - /promote <experimentId> <agentId>
 *
 * Everything shown here comes from real agent runs (see agent-bridge.js).
 * If an agent fails, the failure is shown - results are never invented.
 */

function isCmd(text, name) {
  return text === name || text.startsWith(name + ' ');
}

// Generated ids look like exp-x1ab2c3; reject anything else before it reaches the bridge.
const EXP_ID_RE = /^exp-[a-z0-9]+$/;
function badId(id) {
  return `❌ \`${id}\` is not a valid experiment id (expected something like \`exp-x1ab2c3\`).`;
}

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

    if (isCmd(trimmed, '/experiment')) {
      const problem = trimmed.replace('/experiment', '').trim();
      if (!problem) {
        return '❌ **Usage:** `/experiment <problem description>`\n*Example:* `/experiment Compare iPhone 16 prices on Amazon and Flipkart`';
      }
      if (problem.length > 2000) {
        return `❌ Problem description is too long (${problem.length} characters, max 2000). Please shorten it.`;
      }
      return await this.handleExperimentCommand(problem);
    }

    if (isCmd(trimmed, '/status')) {
      const expId = trimmed.replace('/status', '').trim() || null;
      if (expId && !EXP_ID_RE.test(expId)) return badId(expId);
      return await this.handleStatusCommand(expId);
    }

    if (isCmd(trimmed, '/cancel')) {
      const expId = trimmed.replace('/cancel', '').trim();
      if (!expId) {
        return '❌ **Usage:** `/cancel <experimentId>`';
      }
      if (!EXP_ID_RE.test(expId)) return badId(expId);
      return await this.handleCancelCommand(expId);
    }

    if (isCmd(trimmed, '/promote')) {
      const parts = trimmed.replace('/promote', '').trim().split(/\s+/);
      const expId = parts[0];
      const agentId = parts[1];
      if (!expId || !agentId || parts.length !== 2) {
        return '❌ **Usage:** `/promote <experimentId> <agentId>` (exactly two arguments)\n*Example:* `/promote exp-x1ab2 agent-b`';
      }
      if (!EXP_ID_RE.test(expId)) return badId(expId);
      if (!/^agent-[a-z]+$/.test(agentId)) {
        return `❌ \`${agentId}\` is not a valid agent id (expected something like \`agent-a\`).`;
      }
      return await this.handlePromoteCommand(expId, agentId, userId);
    }

    return null; // Not a recognized command
  }

  async handleExperimentCommand(problem) {
    const experimentId = `exp-${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 5)}`;

    // Page 4: Agreed JSON format from Person 1 -> Person 2
    const requestPayload = {
      experimentId,
      problem,
      agents: [
        { id: 'agent-a', hypothesis: 'direct approach' },
        { id: 'agent-b', hypothesis: 'alternative approach' }
      ]
    };

    const res = await this.supervisor.startExperiment(requestPayload);
    if (res.error) {
      return `❌ Experiment not started: ${res.error}`;
    }

    const lines = [
      `🧪 **Experiment Started: \`${experimentId}\`**`,
      `**Problem:** "${problem}"`,
      `**Agents launched (real runs, separate folders):**`
    ];

    if (res.worktrees) {
      for (const w of res.worktrees) {
        const where = (w.git || w.branch) ? `branch \`${w.branch}\` in \`${w.path}\`` : `\`${w.path}\` (folder copy, no git here)`;
        lines.push(`  • **${w.agentId}** (${w.strategy || w.hypothesis || 'agent'}): ${where}`);
      }
    }
    if (res.mode === 'local') {
      lines.push('⚙️ Mode: local real agents on this machine (Person 2 supervisor not reachable).');
    }
    lines.push(`⏳ Agents are working now. Check progress with \`/status ${experimentId}\` (or just \`/status\` for the latest).`);
    return lines.join('\n');
  }

  _fmtMode(mode) {
    return mode === 'remote'
      ? '⚙️ Mode: Person 2 supervisor API.'
      : '⚙️ Mode: local real agents on this machine (Person 2 supervisor not reachable).';
  }

  _fmtDuration(ms) {
    const s = Math.round(ms / 1000);
    return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
  }

  _fmtAgentLine(a) {
    const label = `**${a.agentId}** (${a.strategy})`;
    if (a.state === 'running') return `  • ${label}: ⏳ running (${this._fmtDuration(a.durationMs)} elapsed)`;
    if (a.state === 'completed') return `  • ${label}: ✅ done in ${this._fmtDuration(a.durationMs)}`;
    return `  • ${label}: ❌ ${a.state}${a.exitCode != null ? ` (exit ${a.exitCode})` : ''}${a.error ? ` - ${a.error}` : ''} (see \`${a.dir}/output.log\`)`;
  }

  async handleStatusCommand(experimentId) {
    const status = await this.supervisor.getStatus(experimentId);
    if (!status) {
      return experimentId
        ? `⚠️ No active experiment found with ID \`${experimentId}\`.`
        : '⚠️ No experiments yet. Start one with `/experiment <problem>`.';
    }

    if (status.status === 'completed') {
      const agents = (status.agents || status.candidates || []).map((a) => {
        // local mode (agents) and remote mode (candidates) shapes
        if (a.strategy !== undefined) return this._fmtAgentLine(a);
        return `  • **${a.agentId}:** Tests: **${a.tests}** | Median: **${a.medianMs}ms**`;
      });

      const lines = [
        `📊 **Experiment Complete: \`${status.experimentId}\`**`,
        status.problem ? `**Problem:** "${status.problem}"` : null,
        this._fmtMode(status.mode),
        `**Results:**`,
        ...agents
      ].filter(Boolean);

      const summaries = (status.agents || []).filter((a) => a.summary);
      for (const a of (status.agents || [])) {
        if (a.state === 'completed' && !(a.summary || '').trim()) {
          lines.push(`\n📝 **${a.agentId} summary:** none - the agent finished without writing SUMMARY.md (not measured, not zero).`);
        }
      }
      for (const a of summaries) {
        const firstLines = a.summary.split('\n').filter((l) => l.trim()).slice(0, 3).join('\n');
        lines.push(`\n📝 **${a.agentId} summary:** ${firstLines}`);
      }

      if (status.evaluation) {
        lines.push(`\n🧪 **Supervisor evaluation:** ${JSON.stringify(status.evaluation).slice(0, 500)}`);
      } else if (status.evaluationError) {
        lines.push(`\n⚠️ **Supervisor evaluation failed:** ${status.evaluationError}`);
      }
      if (status.winner) {
        if (status.judgeNote) lines.push(`\n🧑‍⚖️ **Judge:** ${status.judgeNote}`);
        lines.push(`🏆 **Recommended Winner:** \`${status.winner}\` (AI judge suggestion based on the agents' real output - not a verified result; you decide)`);
        lines.push(`⚠️ **Human Approval Required:** To approve this solution, run:`);
        lines.push(`\`/promote ${status.experimentId} ${status.winner}\``);
      } else {
        if (status.judgeNote) lines.push(`\n🧑‍⚖️ **Judge:** ${status.judgeNote}`);
        lines.push(`⚠️ No automatic winner. Read the summaries and promote one yourself:`);
        lines.push(`\`/promote ${status.experimentId} <agentId>\``);
      }
      return lines.join('\n');
    }

    if (status.status === 'judging') {
      const agents = (status.agents || []).map((a) => this._fmtAgentLine(a));
      return [
        `🧑‍⚖️ **Experiment \`${status.experimentId}\`:** both agents finished, the judge agent is comparing the results now.`,
        this._fmtMode(status.mode),
        ...agents,
        `Run \`/status ${status.experimentId}\` again in a moment for the verdict.`
      ].join('\n');
    }

    // running / unknown
    const agents = (status.agents || []).map((a) => this._fmtAgentLine(a));
    return [
      `⏳ **Experiment \`${status.experimentId}\` Status:** \`${status.status}\``,
      ...(status.mode ? [this._fmtMode(status.mode)] : []),
      ...(agents.length ? agents : [`(${status.progress || 'Agents working...'})`]),
      `Run \`/status ${status.experimentId}\` again to check progress.`
    ].join('\n');
  }

  async handleCancelCommand(experimentId) {
    const res = await this.supervisor.cancelExperiment(experimentId);
    if (res.error || res.success === false) {
      return `❌ Cancel failed: ${res.error || 'unknown error'}`;
    }
    const warn = (res.cleanupWarnings || []).length ? `\n⚠️ Cleanup warnings: ${res.cleanupWarnings.join('; ')}` : '';
    if (res.partial) {
      return `🛑 Experiment \`${experimentId}\`: cancel requested, but cleanup is NOT complete.${warn}`;
    }
    return `🛑 Experiment \`${experimentId}\` has been cancelled. Stop was requested for the agent processes and the work folders were removed.${warn}`;
  }

  async handlePromoteCommand(experimentId, agentId, userId) {
    const res = await this.supervisor.promoteCandidate(experimentId, agentId, userId);
    if (res.error || res.success === false) {
      return `❌ Promotion failed: ${res.error || 'supervisor did not confirm the promotion'}`;
    }
    const lines = [`✅ **Promotion Approved by ${userId}!**`];
    if (res.mode === 'git') {
      lines.push(`Branch \`${res.branch}\` has been merged into the main branch.`);
    } else if (res.mode === 'copy') {
      lines.push(`No git in this folder, so the winner's files were copied to \`${res.dest}\` (${res.filesCopied} files) - an exported candidate, not a git merge.`);
    } else {
      const commit = res.promotedCommit ? ` Commit: \`${String(res.promotedCommit).slice(0, 12)}\`.` : '';
      lines.push(`Branch \`${res.branch || `experiment/${agentId}`}\` was merged by the supervisor.${commit}`);
    }
    if (res.note) lines.push(`⚠️ ${res.note}`);
    return lines.join('\n');
  }
}
