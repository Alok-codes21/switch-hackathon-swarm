# Person 1 - Tasks 3 and 4 setup guide

## The two modes (read this first)

**Local OpenCode mode (supported, tested).** The Person 2 supervisor is not
running, so `/experiment` starts two real OpenCode agents on the host machine,
in git worktrees (or plain folder copies when there is no `.git`). `/promote`
does a git merge, or exports the winner's files into `promoted/` when there is
no git (clearly labelled, not a merge). This is the mode the demo uses.

**Supervisor-integrated mode (NOT yet tested together).** When the Person 2
supervisor API answers, the same commands are forwarded to it as the agreed
JSON contract and it owns worktrees, evaluation and promotion. This path is
contract-compatible but has never been run end to end with this chat part.
Do not present it as verified.

There are also two ways to type a command, which are NOT the same component:
- **Option A - room agent (Switch):** the Switch-hosted agent in the room reads
  `@bot /experiment ...` and runs `src/cli.js`. This is the Switch path.
- **Option B - slash server (this repo):** a small Node server translates native
  Mattermost `/experiment` typing into the same commands. It is NOT Switch; it
  only carries the text. Switch still carries the agent work via Option A.

Task 3: `/experiment` command in chat.
Task 4: the problem goes to the Person 2 supervisor as the agreed JSON
(`{experimentId, problem, agents[]}`, answer carries `worktrees`, later a
`winner` + `requiresHumanApproval`).

This patch adds:

- `src/cli.js` - runs any swarm command once and prints the chat answer
- `src/server/slash-server.js` - real Mattermost slash commands (Option B)
- `docs/ROOM-AGENT-INSTRUCTIONS.md` - briefing to paste into the room
- `.env.example` - copy to `.env`
- `test/test-slash-server.js` - tests

`src/switch/agent-bridge.js` already sends the agreed JSON to the supervisor
(`POST {SUPERVISOR_API_URL}/api/experiments`) and falls back to two real local agents when the supervisor
is not reachable, so the LOCAL chat flow works today. Be precise about what the
local mode proves: the judge COMPARES the two agents' real changes - the actual
git patch of tracked files and the contents of new files, weighted above each
agent's own summary - but it is an AI comparison, not automated testing or
benchmarking. The
supervisor-integrated execution (worktrees, evaluation, promotion through the
supervisor) is contract-compatible but has NOT been run end to end with this
chat part - treat it as unverified.

---

## Option A - through the room agent (Switch path, start here, ~10 min)

No new server. The Switch-hosted bot you already have runs the commands.

0. Needs Git, Node.js 18 or newer, Docker, Switch Console and OpenCode (logged in) already installed. Check `opencode --version` and run one small `opencode run "say hi"` first.
1. Clone the repo (`git clone https://github.com/Alok-codes21/switch-hackathon-swarm.git`, then `cd switch-hackathon-swarm` and `git checkout swarm-tasks-3-4`), then in PowerShell, from the repo folder (the one with
   `package.json`), run:
   `npm install`
   `Copy-Item .env.example .env`
   Check it works: `node src/cli.js "/status"` should print "No experiments yet", not an error.
2. (`.env` is already created in step 1; edit it if you need other values.)
3. Open Switch Console, open your room, edit **Instructions**, paste the block
   from `docs/ROOM-AGENT-INSTRUCTIONS.md`, and replace `REPO_PATH` in that
   text with the full path of your repo folder (it is only a placeholder, not
   a `.env` variable).
4. In the Mattermost channel, send:
   `@switch-buddy-admin /experiment Response time is 4 seconds under load`
5. The agent will ask to run a bash command. Choose **Allow for this session**
   (once per session instead of every command).
6. The agent posts the experiment card in the channel. Try
   `@switch-buddy-admin /status <expId>` after a few seconds.

If the agent does not react: check the exact @mention, run `!agents-status`,
and make sure the message starts with the mention.

## Option B - real "/experiment" typing (native Mattermost command, NOT Switch)

Option A needs the @mention. Option B gives literal `/experiment ...` typing
and the answer is always public (`in_channel`, never "Only visible to you").
This server only translates the command text; it is not a Switch feature.

1. After `npm install`, open a second terminal in the repo folder, run and leave running: `node src/server/slash-server.js`
2. In Mattermost: main menu -> **Integrations** -> **Slash Commands** ->
   **Add Slash Command**.
   - Command Trigger Word: `experiment`
   - Request URL: `http://host.docker.internal:4000/slash/experiment`
     (Mattermost runs in Docker, so `localhost` would point inside the
     container; `host.docker.internal` reaches your Windows machine. If your
     Mattermost runs directly on Windows, use `http://localhost:4000/slash/experiment`.)
   - Request Method: `POST`
3. Mattermost shows a **Token**. Put it in `.env` as `MM_SLASH_TOKEN` and
   restart the server. Recommended: without a token the server still starts but
   prints a loud warning, because anyone who can reach the port could then run
   the commands.
4. Repeat steps 2-3 with trigger words `status`, `cancel`, `promote` and URLs
   `/slash/status`, `/slash/cancel`, `/slash/promote`. The same token setting
   works if you paste each token; simplest is one shared token value.
5. Type `/experiment Response time is 4 seconds` in the channel. The answer
   posts publicly for everyone.

Note: slash commands added this way belong to your Mattermost workspace, not
to Switch. Switch still carries the agent work; this server only translates
the command text. Test with `node test/test-slash-server.js`.

## Checklist (demo-ready)

- [ ] `npm run test:commands`, `npm run test:git`, `npm run test:persist` and
      `npm run test:slash` all pass (they use the fake agent CLI, so no Docker,
      Switch or OpenCode needed for this check)
- [ ] `@bot /experiment ...` posts an experiment card in the channel (Option A)
- [ ] `/experiment ...` works as a native command (Option B)
- [ ] `/status <id>` shows real progress; repeat it until both agents and the judge finish (minutes, not seconds)
- [ ] `/promote <id> agent-b` shows "Promotion Approved by <your name>"
- [ ] (Unverified, optional) With Person 2's supervisor up, the same commands hit
      the real API (set `SUPERVISOR_API_URL` in `.env`) - this path has never
      been tested together; check it before showing it to anyone

## If you run the Person 2 supervisor (feature/part-2)

- Supervisor-integrated mode: not merged and not tested together with this chat part. Without it, local mode runs.
- Default address is `http://127.0.0.1:3000` (set `SUPERVISOR_API_URL` to change it).
- It needs a clean git working tree (no uncommitted files) before `/experiment`, and again before `/promote`. If it refuses, the chat shows its reason.
- On that branch the API does not yet run the tests and scoring by itself, so `/status` can stay `running`. Check this before demoing it.

## If something goes wrong (recovery)

- `/cancel` shows a cleanup warning: run `git worktree list`, then `git worktree remove --force <folder>` and `git branch -D <experiment branch>` by hand.
- `.swarm-state.json` is unreadable: the bot copies it to `.swarm-state.json.corrupt-<time>` and REFUSES new experiments, because agents from the lost state may still be running untracked. Stop them in Task Manager, then delete or restore the state file (or set `SWARM_STATE_RESET=1` to start fresh).
- If the supervisor times out, the chat says the outcome is unknown. It does not start a second run.
