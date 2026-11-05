# Git Worktree Experiment Swarm (Flip the Switch Hackathon)

## Architecture Overview
This project connects the **OpenCode** AI coding agent to team chat via **Switch** (docs.switchagents.ai).
- **Person 1 (Host & Agent Integration):** Host runtime, Switch server, OpenCode provider, and safe execution permissions.
- **Person 2 (Swarm Supervisor):** Git worktree dispatcher, multi-branch experiment runner, and chat-based promotions.

## Core Constraint
Switch is the central nervous system of this project. If Switch stops running, the coordination stops.
Tool write/execute calls require human sign-off before applying changes.
