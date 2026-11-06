# Person 1 - Tasks 3 and 4 setup guide

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
(`POST {SUPERVISOR_API_URL}/api/experiments`) and falls back to a mock
supervisor when Person 2 is not running yet, so the full chat flow works
today.

---

## Option A - through the room agent (start here, ~10 min)

No new server. The bot you already have runs the commands.

1. Get these files into your repo folder (apply `changes.patch` or copy the
   zip contents over the repo).
2. Copy `.env.example` to `.env`.
3. Open Switch Console, open your room, edit **Instructions**, paste the block
   from `docs/ROOM-AGENT-INSTRUCTIONS.md`, and set `REPO_PATH` to your real
   repo folder.
4. In the Mattermost channel, send:
   `@switch-buddy-admin /experiment Response time is 4 seconds under load`
5. The agent will ask to run a bash command. Choose **Allow for this session**
   (once per session instead of every command).
6. The agent posts the experiment card in the channel. Try
   `@switch-buddy-admin /status <expId>` after a few seconds.

If the agent does not react: check the exact @mention, run `!agents-status`,
and make sure the message starts with the mention.

## Option B - real "/experiment" typing (native Mattermost command)

Option A needs the @mention. Option B gives literal `/experiment ...` typing
and the answer is always public (`in_channel`, never "Only visible to you").

1. Run and leave running: `node src/server/slash-server.js`
2. In Mattermost: main menu -> **Integrations** -> **Slash Commands** ->
   **Add Slash Command**.
   - Command Trigger Word: `experiment`
   - Request URL: `http://host.docker.internal:4000/slash/experiment`
     (Mattermost runs in Docker, so `localhost` would point inside the
     container; `host.docker.internal` reaches your Windows machine. If your
     Mattermost runs directly on Windows, use `http://localhost:4000/slash/experiment`.)
   - Request Method: `POST`
3. Mattermost shows a **Token**. Put it in `.env` as `MM_SLASH_TOKEN` and
   restart the server.
4. Repeat steps 2-3 with trigger words `status`, `cancel`, `promote` and URLs
   `/slash/status`, `/slash/cancel`, `/slash/promote`. The same token setting
   works if you paste each token; simplest is one shared token value.
5. Type `/experiment Response time is 4 seconds` in the channel. The answer
   posts publicly for everyone.

Note: slash commands added this way belong to your Mattermost workspace, not
to Switch. Switch still carries the agent work; this server only translates
the command text. Test with `node test/test-slash-server.js`.

## Checklist (demo-ready)

- [ ] `@bot /experiment ...` posts an experiment card in the channel (Option A)
- [ ] `/experiment ...` works as a native command (Option B)
- [ ] `/status <id>` shows the approval gate after the mock finishes (~3s)
- [ ] `/promote <id> agent-b` shows "Promotion Approved by <your name>"
- [ ] With Person 2's supervisor up, the same commands hit the real API
      (set `SUPERVISOR_API_URL` in `.env`)
