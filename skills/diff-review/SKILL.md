---
name: diff-review
description: Open a Git diff in Hunk. Use for a working tree, staged changes, latest commit, explicit commit, or revision range.
---

# Diff Review

1. Run `command -v hunk`. Stop with the installation error if it is unavailable.
2. Resolve the requested scope to one command:
   - Working tree: `hunk diff`
   - Staged changes: `hunk diff --staged`
   - Latest commit: `hunk show`
   - Explicit commit: `hunk show <ref>`
   - Revision range: `hunk diff <range>`, such as `hunk diff main...HEAD`

   Put pathspecs after `--`. Use `--watch` only for a requested live view. If the scope is unclear, ask one question. This step is complete when one command represents the full requested scope.
3. Reject any user-provided ref, range, or pathspec that contains a newline. Shell-quote every user-provided argument.
4. Invoke the command through the matching branch below. Completion requires either a focused Hunk tab in Herdr or an exact command that the user can run outside Herdr.

## Herdr branch

When `[ "${HERDR_ENV:-}" = 1 ]`:

1. Run `herdr pane list` and parse the single pane with `focused: true`. Stop if there is not exactly one. Read `workspace_id` and use `foreground_cwd`, falling back to `cwd` only when it is empty.
2. Run `herdr tab create --workspace "$WORKSPACE_ID" --label "Hunk: <scope>" --no-focus`. Parse `result.tab.tab_id` and `result.root_pane.pane_id` from this response; do not guess or reuse IDs.
3. Build the shell-quoted command `cd <focused-cwd> && exec hunk ...`, then run `herdr pane run "$PANE_ID" "$COMMAND"`.
4. After that succeeds, run `herdr tab focus "$TAB_ID"`.

This branch is complete only when the newly created Hunk tab is focused in the focused pane's workspace.

## Outside Herdr branch

Do not launch Hunk in a noninteractive shell because its TUI can hang. If a true interactive terminal handoff is available, run the command there. Otherwise, print the exact shell-quoted command for the user to run. This branch is complete when the interactive handoff starts or the command is printed.
