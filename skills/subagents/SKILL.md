---
name: subagents
description: invoke this skill when the user asks you to use subagents
---

# Subagents

Each subagent is headless, has its own context window, cannot see the parent conversation, cannot ask the user, and cannot spawn subagents or workflows. Give every child a self-contained prompt with paths, constraints, and the expected report.

## Pi Harness

**Harness:** `pi`
**Prompt nicknames:** “pi”, “pi agent”, “pi subagent”
**Best default:** Use `openai-codex/gpt-5.6-luna` with `xhigh` effort when the user does not request another harness, model, or effort. Set both fields explicitly instead of inheriting them from the parent.

Pi can use any model shown by `pi --list-models`. Prefer `provider/model-id`; a bare model id only works when unambiguous. Common picks in this environment:

| Model                                  | Recommended effort |
| -------------------------------------- | ------------------ |
| `openai-codex/gpt-5.6-luna` (default) | `xhigh`            |
| `openai-codex/gpt-5.6-sol`            | `high`             |
| `opencode-go/deepseek-v4-flash`       | `medium`           |

**Thinking budgets:** `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`. These map directly to pi thinking levels.

## Spawn and Manage

Call `subagent_spawn` with a complete `prompt`, short `name`, and optional `working_dir`, `model`, and `reasoning_effort` (`harness` is always `"pi"` and can be omitted). At most four pi subagents run concurrently.

- `subagent_check({ id })`: peek without blocking.
- `subagent_list()`: list all runs.
- `subagent_wait({ ids })`: block only when results are required to proceed.
- `subagent_cancel({ ids })`: stop runs while preserving partial transcripts.
- `/subagents`: inspect or take over a run interactively.

Results return automatically. After spawning, continue useful parent work instead of immediately waiting.
