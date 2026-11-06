# Room agent instructions (paste into the Switch room's Instructions)

In Switch Console, open the room (the Mattermost channel that has the bot),
edit **Instructions**, and paste the block below. Replace `REPO_PATH` with the
real folder of this repo on the host machine, for example
`C:\Users\YOURNAME\switch-hackathon-swarm`.

---

## Swarm commands (Git Worktree Experiment Swarm)

This room runs the experiment swarm. When a message addressed to you contains
one of these commands (usually right after your @mention), run it and post the
result:

- `/experiment <problem description>` - start a new experiment with two real agents
- `/status [experimentId]` - show progress and results (no ID = latest experiment)
- `/cancel <experimentId>` - stop an experiment and try to clean up its work folders (the output says if it failed)
- `/promote <experimentId> <agentId>` - apply the winning solution (human decision)

How to run a command:

1. Use your terminal/bash tool to run, in the repo folder `REPO_PATH` (the folder that contains `package.json`; it is a placeholder you fill in, not a `.env` setting):
   `node src/cli.js "<the full command line>" "<the sender's name>"`
   Example: a message `@bot /experiment API latency is 4s` from user `alok`
   becomes `node src/cli.js "/experiment API latency is 4s" "alok"`.
   If the message contains double quotes or line breaks, do not put it inside
   a shell string. Write the message text to a file (for example `msg.txt`)
   with your file tool, then run `node src/cli.js --file msg.txt "<the sender's name>"`.
2. Post the command's printed output back to the room with `post_message`,
   verbatim, inside a normal message. Do not summarize it and do not send it
   as a targeted/private message - the whole room must see it.
3. Never invent experiment results. Only post what the command prints. If the
   command fails, post the error text it printed.
4. After `/experiment`, the two agents keep working in the background. When a
   human asks how it is going, run `/status` again and post the new output.
   Real agent runs take minutes, not seconds.
5. If a message does not contain one of the four commands, answer normally.

---

The agents these commands launch are real OpenCode runs on the host machine,
each in its own folder under `.worktrees/`. Their summaries, timings and the
judge verdict in `/status` come from the actual runs; a failed agent is shown
as failed. Why commands travel as text: Switch has a fixed set of `!` room
commands and Mattermost has no Switch slash commands, so the swarm commands
are carried as ordinary text to the agent, and the agent runs them through
`src/cli.js`.
