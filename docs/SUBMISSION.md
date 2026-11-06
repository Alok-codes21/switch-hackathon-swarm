# Submission form draft (do not submit before the team lead reviews)

**Project name:** Git Worktree Experiment Swarm

**One-liner:** A team chat room where an AI coding agent runs two different approaches in separate folders, a judge agent compares them, and a human picks and approves which result to apply.

**Description:** Built on Switch with OpenCode and Mattermost. In chat, `/experiment <problem>` starts two real OpenCode agents with different approaches, each in its own folder under `.worktrees/`. `/status` shows real progress and a judge agent's recommendation. `/promote` applies a finished candidate only after a human picks it in chat (the judge only recommends). `/cancel` requests that the runs stop and tries to remove their folders (a folder is kept and a warning shown if git cannot remove it); it shows git cleanup warnings and does not verify every process exited. Switch-hosted tool actions can ask a human for approval; the two experiment agents run with a limited local permission policy, and promotion needs an explicit /promote command (the chat user name is not independently verified). A separate supervisor service (Person 2, not merged into this branch) can answer the same JSON contract; its full run-and-score flow is not tested together with this chat part. Without it (confirmed connection failure), local mode runs; an error answer is shown, and a timeout is reported as an unknown outcome with no second run.

**Track:** Best Business Workflow (primary). Personal/Creative optional.

**Role of Switch:** chat transport, agent hosting, human approvals in the room.

**Tech:** Node.js, Switch Console, OpenCode, Mattermost, Docker.

**Team:** Alok (Person 1, host and agent integration); Yenika Choudhary (Person 2, supervisor) - UNCONFIRMED, confirm before submitting.

**Repo:** https://github.com/Alok-codes21/switch-hackathon-swarm (branch swarm-tasks-3-4 until merged)

**Demo video:** [LINK - to be added after recording]

**Known limits:** Runs on the host machine only and needs Docker and Switch Console running.
