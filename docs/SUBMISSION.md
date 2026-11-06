# Submission form draft (do not submit before the team lead reviews)

**Project name:** Git Worktree Experiment Swarm

**One-liner:** A team chat room where an AI coding agent runs two different approaches in separate folders, a judge agent compares them, and a human approves the winner.

**Description:** Built on Switch with OpenCode and Mattermost. In chat, `/experiment <problem>` starts two real OpenCode agents with different approaches, each in its own folder under `.worktrees/`. `/status` shows real progress and a judge agent's recommendation. `/promote` applies the winner only after a human decision. `/cancel` stops runs and cleans up. Writes and commands go through Switch approval. A separate supervisor service (Person 2) can answer the same JSON contract. Without it, local mode runs.

**Track:** Best Business Workflow (primary). Personal/Creative optional.

**Role of Switch:** chat transport, agent hosting, human approvals.

**Tech:** Node.js, Switch Console, OpenCode, Mattermost, Docker.

**Team:** Alok (Person 1, host and agent integration); Yenika Choudhary (Person 2, supervisor) - UNCONFIRMED, confirm before submitting.

**Repo:** https://github.com/Alok-codes21/switch-hackathon-swarm (branch swarm-tasks-3-4 until merged)

**Demo video:** [LINK - to be added after recording]

**Known limits:** Runs on the host machine only and needs Docker and Switch Console running.
