# Demo script (about 2 minutes)

Before recording: Docker, Switch Console and OpenCode are running, the room has the instructions from `docs/ROOM-AGENT-INSTRUCTIONS.md`, and you did one dry run.

1. (0:00) Say: "Our team chat room runs on Switch. An AI coding agent, OpenCode, is a teammate in it." Show Switch Console and the Mattermost room.
2. (0:15) Post: `@bot /experiment <small real problem>`. Show the reply with the experiment id and two agents, each in its own folder under `.worktrees/`.
3. (0:40) Show a Switch approval prompt if one appears in the room. Say: "Switch can ask a human to approve actions. The two experiment agents run with their own limited permissions, and a human decides the promotion."
4. (1:00) Post: `@bot /status <id>`. Show real progress, durations, each agent's `SUMMARY.md` and the judge agent's verdict. Say: "Results come from real runs. A failed agent shows as failed."
5. (1:30) Post: `@bot /promote <id> <agent>`. Show the chosen candidate applied (say it is the one you picked; the judge only recommends). Say: "A human decides the promotion."
6. (1:50) Say: "The chat and agent part is live and real. The supervisor service (Person 2) is a separate component. If it is not running, local mode answers."
   Only say the last sentence if Person 2's part is not integrated in the recording.

Do not claim anything the recording does not show.
