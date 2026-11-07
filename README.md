# Git Worktree Experiment Swarm (Flip the Switch Hackathon)

## Architecture Overview
This project is designed to connect the **OpenCode** AI coding agent to team chat via **Switch** (docs.switchagents.ai). The live chat integration is shown in the recording; this repo holds the command logic and the local agent runner.
- **Person 1 (Host & Agent Integration):** Host runtime, Switch server, OpenCode provider, and a restricted OpenCode permission policy (not an OS-level sandbox).
- **Person 2 (Swarm Supervisor):** Git worktree dispatcher, multi-branch experiment runner, and chat-based promotions.

## Core Constraint
The intended workflow uses Switch for team-chat coordination. The local agent processes are started on the host machine.
Switch-hosted tool actions can ask a human for approval. The local headless agent runs started by `/experiment` use a separate permission policy: file edits allowed, shell limited to a short allow list.

## Who does what (what Switch actually handles)

| Component | Responsibility |
|---|---|
| Switch | Room coordination: hosts the AI agent in the team room, carries messages and human approval prompts |
| Mattermost | The human-facing team chat UI (bundled with Switch Console) |
| OpenCode | The coding agent that does the actual work (in the room, and as the two headless experiment agents) |
| This Node.js repo | Command parsing (/experiment, /status, /promote, /cancel), agent runner, supervisor integration |
| Person 2 supervisor (`src/supervisor/`, this repo) | Git worktrees, evaluation and promotion when it is running |

The room agent is Switch-hosted. The two experiment agents are headless OpenCode
processes started on the host machine by this repo - Switch does not run them.

## Two execution modes (they are not the same workflow)

| | Local mode (tested) | Supervisor mode (Person 2, NOT yet tested together) |
|---|---|---|
| When it runs | Supervisor API unreachable (confirmed connection failure) | Supervisor API answers |
| Agent folders | git worktrees, or plain folder copies when there is no .git | managed by the supervisor |
| Promotion | git merge, or an exported file copy into `promoted/` (clearly labelled, not a merge) | done by the supervisor after human approval |
| Evaluation | AI judge agent compares real agent outputs (a comparison, NOT automated testing or benchmarking); a human still decides | supervisor's automated tests, benchmarks and scoring (not verified together with this chat part) |

A plain folder copy is not a git worktree and its promotion is an export, not a
merge - the chat output always says which one happened. Local mode starts only
after a confirmed connection failure: an HTTP error is shown, and a timeout is
reported as "outcome unknown" with no second run.

## What the chat commands really do
- `/experiment <problem>` first tries the Person 2 supervisor API. If that is
  not running, it launches **two real OpenCode agents on this machine**, each
  in its own folder under `.worktrees/`: Agent A takes the direct approach,
  Agent B a deliberately different one. Both get the same problem text (on Windows the shell can change quotes and special characters, see below).
- `/status [id]` reads the actual agent runs: live progress, real durations,
  each agent's own `SUMMARY.md`, then a real **judge agent** compares both
  outputs and recommends a winner. The judge works from real evidence - the
  actual git patch of tracked files and the contents of new files, weighted
  above each agent's own summary - so an agent that only wrote its summary
  cannot be recommended. Failed agents are shown as failed - results are
  never invented.
- `/promote <id> <agent>` applies the candidate a human picks (any finished
  agent; the judge only recommends): a git merge when the folder is a git
  repo, otherwise a copy of the files into `promoted/`.
- `/cancel <id>` stops each agent's full process tree and waits for confirmed exit before removing folders: a zombie-aware process-group check with SIGKILL escalation on macOS/Linux, and `taskkill /T /F` plus a PowerShell descendant check on Windows. A folder is kept (not deleted) when a process survives or git cannot remove it; the chat then says cleanup is not complete.
- Prompt text goes through a shell command line, so quotes and special characters in the problem text can be changed before the agent sees them. Keep problem texts plain and under 2000 characters.

The agent command is configurable (`SWARM_AGENT_CMD` in `.env`), default
`opencode run {prompt}`. If the Person 2 supervisor is reachable, its
contract JSON answers instead and local mode stays out of the way.

## Try it in 2 minutes
You do not need the Switch room to try the commands - the same four commands the room agent uses run straight from a terminal (Node.js 18+; the agent CLI comes from `SWARM_AGENT_CMD`, default `opencode run`):

```
git clone https://github.com/Alok-codes21/switch-hackathon-swarm.git
cd switch-hackathon-swarm
git checkout swarm-tasks-3-4
npm install
node src/cli.js "/experiment write a JavaScript function reverseWords(sentence) that reverses the order of words in a sentence"
node src/cli.js "/status"
node src/cli.js "/promote <experiment-id> agent-a"
node src/cli.js "/cancel <experiment-id>"
```

`/experiment` starts two real agents in `.worktrees/<id>-a` and `.worktrees/<id>-b` and prints the experiment ID. `/status` shows live progress and the judge's recommendation. `/promote` merges the candidate a human picks into the experiment's base branch. `/cancel` stops a running experiment and cleans up.

## Tests
Four suites, all run with a fake agent CLI (`test/fake-agent.js`) instead of OpenCode - results come from real runner processes, folders, state files and git repos, nothing mocked:
- `npm run test:commands` - end-to-end local flow: experiment, status, judge verdict, promote, double-promote refusal, cancel.
- `npm run test:git` - real git worktrees and candidate branches, a real merge commit on the experiment's base branch, and refusal to promote onto a different branch.
- `npm run test:persist` - state survives across separate one-shot processes (the way the room agent uses `src/cli.js`), incl. deterministic concurrent saves from parallel processes.
- `npm run test:slash` - the Mattermost slash-command server: token checks, public answers, promote, cancel response.
- Person 2 supervisor suites (`node:test`): `npm run test:evaluation` (evaluation service), `test:server` (supervisor API), `test:promotion` (promotion manager), `test:scorer` (scoring), `test:agent-status` (agent status reporting).

## Team
- Person 1 - Alok: Switch host, OpenCode integration, chat commands.
- Person 2 - Yenika Choudhary: swarm supervisor (git worktree manager, test runner, scoring, promotion). Her `feature/part-2` branch is merged into this branch.

## More docs
- `docs/PERSON1-TASK3-4-SETUP.md` - setup guide (room agent, or real Mattermost slash commands via `src/server/slash-server.js`)
- `docs/ROOM-AGENT-INSTRUCTIONS.md` - instructions to paste into the Switch room
- `docs/DEMO-SCRIPT.md` - demo walkthrough

## Known limits
Runs only on the host machine. Agent output depends on the model behind OpenCode. Headless agents may edit files and run a short list of shell command patterns (`node *`, `npm test*`, `npm run *`, `ls*`, `dir*`, `cat *`, `type *`); other commands are denied. Set `SWARM_AGENT_BASH_STRICT=1` to drop `npm run *` from the list. The `node *` and `npm run *` patterns are broad, so this is an application-level policy, not a sandbox. Do not run untrusted problems on a machine with sensitive data. The Person 2 supervisor code lives in this branch, but supervisor mode and local mode are still separate paths that have not been tested together.
