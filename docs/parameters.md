# Parameters API Reference

These are the parameters the **LLM agent** passes when it calls the `subagent` tool (provided by Pi Subagents). These parameters are used to delegate work to Superpowers role agents.

> [!IMPORTANT]
> `pi-superagents` does **not** register the `subagent` tool. Install `pi-subagents` separately when `useSubagents` is enabled.
>
> When delegating to Pi Subagents, use `context: "fresh" | "fork"` instead of `sessionMode` parameters. Pi Subagents does not support Superagents-specific `sessionMode` or legacy parameter conventions.

## Tool Parameters

| Param             | Type                                    | Default                   | Description                                                                                                                                                        |
| ----------------- | --------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `agent`           | string                                  | -                         | Name of the role agent (e.g., `sp-recon`, `sp-implementer`). Used for single-agent delegation. |
| `task`            | string                                  | -                         | The specific task for the role agent to execute. |
| `tasks`           | `TaskItem[]`                            | -                         | Array of tasks for parallel execution. Each item must specify `agent` and `task`. |
| `context`         | `"fresh" \| "fork"` | `"fresh"` (bounded roles) | Pi Subagents context mode. `fresh` starts a fresh child context; `fork` inherits parent context according to Pi Subagents semantics. **Do not use Superagents `sessionMode` parameter** when calling Pi Subagents. |
| `cwd`             | string                                  | parent cwd                | Working directory for the subagent. |
| `skill`           | `string \| string[] \| false`           | agent default             | Skills to inject into the agent prompt. `false` disables all skills. |
| `model`           | string                                  | agent default             | Override the model for this specific run. Can be a concrete ID or a tier name (`cheap`, `balanced`, `max`). |
| `artifacts`       | boolean                                 | `true`                    | Whether to write debug artifacts (input/output logs). |
| `includeProgress` | boolean                                 | `false`                   | Whether to include full internal progress metadata in the result. |

Resolved skills, including per-call `skill` overrides and agent frontmatter defaults, can be inspected via `subagent({ action: "status" })` when Pi Subagents is installed. Missing skills are shown as warnings there. The bundled `sp-debug` role resolves `systematic-debugging` from its frontmatter unless a call overrides or disables skills.

Provide either `agent` plus `task` for a single delegation, or `tasks` for parallel delegation. Do not pass Superagents-only parameters such as `workflow`, `sessionMode`, or `useTestDrivenDevelopment` to Pi Subagents. When TDD is required, include the requirement in the child task text or pass `skill: "test-driven-development"`.

Subagent output is inline: the child Pi process streams assistant text back through the `subagent` tool result. The tool does not instruct Superpowers roles to write repo-root report files.

> **Note:** The `subagent` tool does not accept ad-hoc extension paths at call time. Extension loading for child Pi processes is controlled through `superagents.extensions` in the global config and the `extensions` field in agent frontmatter (additive to the global list). Implicit Pi extension discovery is disabled by default; only configured extensions are loaded for subagents. Configured entries may be local paths or normal Pi `-e` source specs such as `npm:@scope/package`, `git:github.com/user/repo`, `https://...`, or `ssh://...`. Missing local paths return a clear error and do not spawn the child Pi process; package and remote specs are resolved by child Pi.

### TaskItem (for parallel tasks)

| Field   | Type    | Description |
| ------- | ------- | ----------- |
| `agent` | string  | Role agent name. |
| `task`  | string  | Task description. |
| `cwd`   | string  | Optional directory override for this specific parallel task. |
| `model` | string  | Optional model/tier override for this task. |
| `skill` | mixed   | Optional skill override for this task. |

## Session Mode

`context` controls how much of the parent session the subagent receives (Pi Subagents parameter):

- **`fresh`** (default for bounded roles): The child session is linked to the parent for `/tree` visibility, but it does not inherit parent conversation turns. The child receives a curated work-brief packet instead. This is the recommended default for bounded Superpowers roles.
- **`fork`**: The child inherits the full parent conversation history as read-only context, working in its own isolated branch. Useful when the subagent genuinely needs the full session background.

> [!NOTE]
> Pass `context: "fresh"` for Superpowers role agents unless the user explicitly requests forked context. Do not use Superagents `sessionMode` in subagent calls.

## Artifacts

When `artifacts` is enabled, Pi Superagents stores debugging input, output, JSONL, and metadata files in the session artifact directory. These artifacts are separate from the repository working tree and replace the older file-handoff pattern that wrote `implementer-report.md`, `spec-review.md`, or `code-review.md` into the project root.

Work briefs for bounded roles are also delivered as packet files under `<session-artifacts-dir>/packets/`. The runtime creates these packets before launching the child, passes the packet path to the child as its input brief, and cleans them up automatically when the child exits.

## Review Bridge Tools

These tools are registered for root Superpowers workflows and are used by the prompt contract when Plannotator review is enabled. They are not general-purpose delegation tools.

### `superpowers_plan_review`

| Param | Type | Description |
| ----- | ---- | ----------- |
| `planContent` | string | Final Superpowers implementation plan content to review. |
| `planFilePath` | string, optional | Saved plan file path. |

### `superpowers_spec_review`

| Param | Type | Description |
| ----- | ---- | ----------- |
| `specContent` | string | Final saved Superpowers brainstorming spec content to review. |
| `specFilePath` | string, optional | Saved spec file path. |

## Settings Overlay

`/sp-settings` opens the Superpowers settings overlay. Use `c` to select a command, then toggle supported workflow options for that command or edit model tiers from PI's authenticated model list. Model tier edits are persisted to `config.json` and apply to future subagents in the current session.

## Result Rendering

Subagent tool results are owned and rendered by Pi Subagents. This applies to both single and parallel subagent executions. Use `subagent({ action: "status" })` to inspect active and recent runs.

## Release Notes

Tool parameter changes can affect prompts, docs, and downstream workflows. Before publishing a version that adds, removes, or changes a parameter, update this reference, `README.md`, and `CHANGELOG.md`, then follow the [Release Process](releases.md).
