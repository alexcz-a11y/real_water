# Orchestration

Two roles work this repo. One session holds one role.

## Planner

Owns everything up to a ticket: `/grill-with-docs` → `/to-spec` → `/to-tickets`, in one unbroken context window. Publishes each ticket as a GitHub issue carrying its blocking edges (see `issue-tracker.md`), then stops. The planner does not implement.

## Implementer

Owns one ticket at a time, in a session that starts fresh from `gh issue view <n> --comments` and runs `/implement`. Everything the ticket needs is in the ticket; where it isn't, that gap is the planner's to close — comment on the issue and ask.

Each ticket gets its own branch. Concurrent tickets get a `git worktree` each, so two implementer sessions never share a working tree.

## Review across the seam

`/implement` closes with its own `/code-review`. Before the branch merges, the planner runs `/code-review` again from its own session, against the merge-base. The two reviews carry different context — the second is the one that catches what the first sat too close to.

## Harness

Both roles read `AGENTS.md`. Claude Code reaches it through `CLAUDE.md`, which imports it; Codex reads it directly. Instructions live in `AGENTS.md` so both roles read the same file. Machine-local wiring — which model fills which role, the exact launch command — belongs in an untracked `CLAUDE.local.md` or user-level config, not here.
