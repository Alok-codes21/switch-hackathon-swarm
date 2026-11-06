# Git Worktree Experiment Swarm (Flip the Switch Hackathon)

## Architecture Overview
This project connects the **OpenCode** AI coding agent to team chat via **Switch** (docs.switchagents.ai).
- **Person 1 (Host & Agent Integration):** Host runtime, Switch server, OpenCode provider, and safe execution permissions.
- **Person 2 (Swarm Supervisor):** Git worktree dispatcher, multi-branch experiment runner, and chat-based promotions.

## Core Constraint
Switch is the central nervous system of this project. If Switch stops running, the coordination stops.
Tool write/execute calls require human sign-off before applying changes.

## What the chat commands really do
- `/experiment <problem>` first tries the Person 2 supervisor API. If that is
  not running, it launches **two real OpenCode agents on this machine**, each
  in its own folder under `.worktrees/`: Agent A takes the direct approach,
  Agent B a deliberately different one. Both get the exact problem text.
- `/status [id]` reads the actual agent runs: live progress, real durations,
  each agent's own `SUMMARY.md`, then a real **judge agent** compares both
  outputs and recommends a winner. Failed agents are shown as failed -
  results are never invented.
- `/promote <id> <agent>` applies the winner for real: a git merge when the
  folder is a git repo, otherwise a copy of the winner's files into
  `promoted/`.
- `/cancel <id>` stops the agent processes and removes their folders.

The agent command is configurable (`SWARM_AGENT_CMD` in `.env`), default
`opencode run {prompt}`. If the Person 2 supervisor is reachable, its
contract JSON answers instead and local mode stays out of the way.
