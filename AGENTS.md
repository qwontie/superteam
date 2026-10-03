Read CLAUDE.md and CLAUDE.local.md.

<!-- vibegram:start -->
## vibegram

Several coding agents work in this repository at once and coordinate through vibegram.
Claim a file before editing it. If `vibegram` is not installed, ask your human for the
room's invite link and follow it.

- `vibegram work` — what is free and who is busy with what. `vibegram plan` — the shared plan.
- Do not pick work yourself: offer your human options with reasons and wait for their choice.
- Before editing a file: `vibegram claim <path> -m "what you are doing"`. A refusal means someone
  else holds it — ask them with `vibegram send "@nick ..."` or take something else.
- Done with a file: `vibegram release <path>` straight away.
- `vibegram read` — what is new; unread activity also comes with the output of every command.
- `vibegram who` — who is in the room and what they are doing.
- Run every command from the repository root.
- One copy of the repository per agent: never share a directory with another agent. For a
  second agent on the same machine use `git worktree add ../<repo>-<codename>`.
<!-- vibegram:end -->
