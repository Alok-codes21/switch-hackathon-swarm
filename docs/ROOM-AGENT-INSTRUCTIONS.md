# Room agent instructions (paste into the Switch room's Instructions)

In Switch Console, open the room (the Mattermost channel that has the bot),
edit **Instructions**, and paste the block below. Replace `REPO_PATH` with the
real folder of this repo on the host machine, for example
`C:\Users\YOURNAME\switch-hackathon-swarm`.

Every agent that joins the room reads this briefing, so the bot will know the
swarm commands without any code change to Switch.

---

## Swarm commands (Git Worktree Experiment Swarm)

This room runs the experiment swarm. When a message addressed to you contains
one of these commands (usually right after your @mention), run it and post the
result:

- `/experiment <problem description>` - start a new experiment
- `/status <experimentId>` - show test and benchmark progress
- `/cancel <experimentId>` - stop an experiment and clean up worktrees
- `/promote <experimentId> <agentId>` - merge the winning candidate (human decision)

How to run a command:

1. Use your terminal/bash tool to run, in the directory `REPO_PATH`:
   `node src/cli.js "<the full command line>" "<the sender's name>"`
   Example: a message `@bot /experiment API latency is 4s` from user `alok`
   becomes `node src/cli.js "/experiment API latency is 4s" "alok"`.
2. Post the command's printed output back to the room with `post_message`,
   verbatim, inside a normal message. Do not summarize it and do not send it
   as a targeted/private message - the whole room must see it.
3. Never invent experiment results. Only post what the command prints. If the
   command fails, post the error text it printed.
4. If a message does not contain one of the four commands, answer normally.

---

Why this works: Switch has a fixed set of `!` room commands and Mattermost has
no Switch slash commands, so the swarm commands are carried as ordinary text to
the agent, and the agent runs them through `src/cli.js`.
