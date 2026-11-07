# Submission form draft (do not submit before the team lead reviews)

**Project name:** Git Worktree Experiment Swarm

**One-liner:** A team chat room where an AI coding agent runs two different approaches in separate folders, a judge agent compares them, and a human picks and approves which result to apply.

**Validation boundary (be honest when asked):** in the verified local mode, the judge is an AI comparison grounded in the candidates' REAL changes - the actual git patch of tracked files and the contents of new files, weighted above each agent's own summary. It is still an AI judgement, not automated test/benchmark execution: automated test/benchmark evaluation belongs to the Person 2 supervisor mode, which is contract-implemented in the bridge (`evaluate`, `diffs`, `list` endpoints) but has not been run end to end with this chat part.

**Description:** Built on Switch with OpenCode and Mattermost. In chat, `/experiment <problem>` starts two real OpenCode agents with different approaches, each in its own folder under `.worktrees/`. `/status` shows real progress and a judge agent's recommendation. `/promote` applies a finished candidate only after a human picks it in chat (the judge is an AI agent and only recommends; its verdict is shown as a suggestion, never as a verified result). In local mode with git, promotion is a real `git merge --no-ff` of the agent's branch; without git it is an export of the winner's files into `promoted/`, labelled as a copy, never as a merge. `/cancel` kills each agent's full process tree and waits for confirmed exit before removing folders (process-group scan on macOS/Linux, taskkill tree kill plus a descendant check on Windows); a folder is kept and a warning shown if a process survives or git cannot remove it. Switch-hosted tool actions can ask a human for approval; the two experiment agents run with a limited local permission policy (file edits allowed; shell limited to a short allow list, `SWARM_AGENT_BASH_STRICT=1` narrows it further), and promotion needs an explicit /promote command (the chat user name is not independently verified). A separate supervisor service (Person 2, not merged into this branch) can answer the same JSON contract; its full run-and-score flow is not tested together with this chat part. Without it (confirmed connection failure), local mode runs; an error answer is shown, and a timeout is reported as an unknown outcome with no second run.

**Track:** Best Business Workflow (primary). Personal/Creative optional.

**Role of Switch:** chat transport, agent hosting, human approvals in the room.

**Tech:** Node.js, Switch Console, OpenCode, Mattermost, Docker.

**Team:** Alok (Person 1, host and agent integration); Yenika Choudhary (Person 2, supervisor) - UNCONFIRMED, confirm before submitting.

**Repo:** https://github.com/Alok-codes21/switch-hackathon-swarm (branch swarm-tasks-3-4 until merged)

**Demo video:** [LINK - to be added after recording]

**Known limits:** Runs on the host machine only and needs Docker and Switch Console running.
