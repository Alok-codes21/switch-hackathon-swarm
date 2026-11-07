# Demo script (about 5 minutes)

Real agents and the judge take MINUTES, not seconds (see the setup guide). This
script plans around that: the running time is filled with showing real artifacts,
not with waiting for a fixed timestamp. Rehearse with the EXACT problem you will
demo and time it; adjust the talking points to however long your machine takes.
Never promise "the verdict at 1:00" - promise to show real progress.

Before recording: Docker, Switch Console and OpenCode are running, the room has
the instructions from `docs/ROOM-AGENT-INSTRUCTIONS.md`, and you did one full
dry run (experiment, status, promote, then a second experiment and cancel).
Keep a second terminal open on the project folder for the worktree views.

1. (0:00-0:30) Say: "Our team chat room runs on Switch. An AI coding agent,
   OpenCode, is a teammate in it." Show Switch Console and the Mattermost room.
2. (0:30) Post: `@bot /experiment <small real problem>` in the room (the
   Switch-hosted room agent runs it - this is the Switch path, not the
   slash-server shortcut). Show the reply with the experiment id and the two
   agent folders. Say whether they are git worktrees or folder copies (the
   reply shows it).
3. (1:00-3:00, while the agents run) Fill this time with real things:
   - Show the two worktree folders side by side and each `output.log` growing.
     Say: "Two isolated working copies, two different approaches, running in
     parallel. Neither can touch the main checkout."
   - Post `@bot /status <id>` once to show live progress and durations.
   - If a Switch approval prompt appears in the room, show it. Say: "Switch can
     ask a human to approve actions. The agents run with limited permissions,
     and a human decides the promotion."
   - If the agents finish early, move on to step 4 early. If they are slow,
     keep showing the logs - that IS the product working.
4. (when /status shows the experiment complete, about 3:00-4:00) Show the final
   status: each agent's `SUMMARY.md`, the actual changed-file list and diff the
   judge based its verdict on, and the judge's recommendation. Say: "Results
   come from real runs. A failed agent shows as failed. The judge compares what
   the agents actually changed - and it only recommends. A human decides."
5. (about 4:00-4:30) Post: `@bot /promote <id> <agent>`. Show the chosen
   candidate merged into the branch the experiment started on (the reply names
   the real branch). Say: "A human decides the promotion."
6. (4:30-5:00) Say: "The chat and agent part is live and real. The supervisor
   service (Person 2) is a separate component. If it is not running, local mode
   answers." Only say the last sentence if Person 2's part is not integrated in
   the recording.

Do not claim anything the recording does not show. If a dry run misses the
verdict in five minutes, pick a smaller demo problem - do not tighten the
timestamps.
