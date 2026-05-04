# Pi Subagents Integration Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `pi-superagents` a workflow/prompt package that delegates through canonical `pi-subagents` without stale Superagents subagent runtime state, config conflicts, or incompatible agent metadata.

**Architecture:** `pi-superagents` will keep Superpowers slash commands, Plannotator bridge tools, root prompt generation, config UI, and `sp-*` agent publishing. Canonical `pi-subagents` remains the only provider of the `subagent` tool, child lifecycle handling, async/status/doctor behavior, and subagent execution. Superagents-published role agents will be normalized into Pi-Subagents-native frontmatter before being copied to `~/.agents/agents`.

**Tech Stack:** TypeScript ESM, Pi extension API, TypeBox schemas, Node test runner (`node --experimental-strip-types --test`), existing package tests.

---

## File structure and responsibilities

- Modify `src/extension/index.ts`.
	- Remove construction of the unused old Superagents `subagent` tool/executor.
	- Keep only Plannotator tools, Superpowers slash command registration, config loading, and role-agent publishing.
	- Point Superagents config to a dedicated `~/.pi/agent/extensions/pi-superagents` directory.
- Create `src/agents/pi-subagents-publisher.ts`.
	- Publish bundled `agents/sp-*.md` into `~/.agents/agents` in Pi-Subagents-compatible format.
	- Convert `session-mode: lineage-only` to `defaultContext: fresh` or remove it.
	- Add explicit Pi Subagents fields: `systemPromptMode`, `inheritProjectContext`, `inheritSkills`.
	- Resolve Superagents model tiers to concrete models from active config.
	- Avoid overwriting edited user files unless content is clearly managed by this package.
- Modify `src/superpowers/root-prompt.ts`.
	- Replace legacy `sessionMode: lineage-only` wording with Pi Subagents `context: fresh|fork` wording.
	- Instruct the parent to pass `context: "fresh"` for Superpowers role agents unless the user explicitly requests forked context.
	- Explain how to pass TDD using Pi Subagents-compatible inputs.
- Modify `src/slash/slash-commands.ts`.
	- Remove Superagents-owned `/subagents-status` and `Ctrl+Alt+S` registration because it reads old `globalRunHistory`.
	- Keep `/sp-settings` and entrypoint commands.
- Modify or retire `src/ui/subagents-status.ts` and `src/execution/run-history.ts` only if they become unused and tests confirm no imports remain.
	- Prefer deletion only after references are removed and tests pass.
- Modify `src/extension/config-store.ts`.
	- Support the new Superagents config directory.
	- Read the legacy `superagents` section from `~/.pi/agent/extensions/subagent/config.json` as a compatibility fallback.
	- Do not fail Superagents because Pi Subagents config keys exist in the shared `subagent/config.json`.
- Modify `default-config.json` and `config.example.json`.
	- Document that Superagents config now lives under `pi-superagents`, not `subagent`.
- Modify docs.
	- `README.md`.
	- `docs/configuration.md`.
	- `docs/parameters.md`.
	- `docs/skills.md`.
	- `CHANGELOG.md`.
- Add/update tests.
	- `test/unit/superpowers-root-prompt.test.ts`.
	- `test/unit/config-store.test.ts`.
	- `test/unit/config-validation.test.ts`.
	- `test/integration/slash-commands.test.ts`.
	- New `test/unit/pi-subagents-publisher.test.ts`.
	- Existing manifest/config/status tests as needed.

## Assumptions

- `pi-subagents` stays installed separately and remains the only registered `subagent` tool.
- Superagents role agents should default to fresh context, because Pi Subagents does not implement Superagents `lineage-only` mode.
- Existing user-edited `~/.agents/agents/sp-*.md` files must not be overwritten silently.
- Backward compatibility should read legacy config, but new writes should target `~/.pi/agent/extensions/pi-superagents/config.json`.

---

### Task 1: Add a Pi-Subagents-native role-agent publisher

**Files:**
- Create: `src/agents/pi-subagents-publisher.ts`
- Test: `test/unit/pi-subagents-publisher.test.ts`

- [ ] **Step 1: Write failing tests for frontmatter normalization**

Create `test/unit/pi-subagents-publisher.test.ts` with tests that assert:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSuperpowersAgentForPiSubagents } from "../../src/agents/pi-subagents-publisher.ts";

void test("normalizes session-mode into Pi Subagents defaultContext", () => {
	const source = `---
name: sp-recon
description: Superpowers reconnaissance specialist
model: cheap
tools: read, grep, find, ls
maxSubagentDepth: 0
session-mode: lineage-only
---

You are recon.`;

	const output = normalizeSuperpowersAgentForPiSubagents(source, {
		modelTiers: { cheap: { model: "openai-codex/gpt-5.4-mini", thinking: "minimal" } },
	});

	assert.match(output, /name: sp-recon/);
	assert.match(output, /model: openai-codex\/gpt-5\.4-mini/);
	assert.match(output, /thinking: minimal/);
	assert.match(output, /defaultContext: fresh/);
	assert.match(output, /systemPromptMode: replace/);
	assert.match(output, /inheritProjectContext: false/);
	assert.match(output, /inheritSkills: false/);
	assert.doesNotMatch(output, /session-mode:/);
});

void test("does not rewrite concrete model ids", () => {
	const source = `---
name: sp-code-review
description: Reviewer
model: openai-codex/gpt-5.5
tools: read, grep, find, ls
---

Review.`;

	const output = normalizeSuperpowersAgentForPiSubagents(source, { modelTiers: {} });

	assert.match(output, /model: openai-codex\/gpt-5\.5/);
	assert.doesNotMatch(output, /model: cheap/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd /Users/jmbenedetto/.pi/agent/git/github.com/jmbenedetto/pi-superagents
npm run test:unit -- test/unit/pi-subagents-publisher.test.ts
```

Expected: FAIL because `src/agents/pi-subagents-publisher.ts` does not exist.

- [ ] **Step 3: Implement normalization module**

Create `src/agents/pi-subagents-publisher.ts` with:

```ts
/**
 * Publishes bundled Superpowers role agents in Pi-Subagents-compatible form.
 *
 * Responsibilities:
 * - normalize Superagents-only frontmatter into canonical Pi Subagents fields
 * - resolve Superagents model tier names into concrete model IDs
 * - copy bundled sp-* role agents into the user's global agent directory safely
 *
 * Important side effects:
 * - write operations are limited to the caller-provided destination directory
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ModelTierSetting } from "../shared/types.ts";
import { parseFrontmatter } from "./frontmatter.ts";

export const MANAGED_AGENT_MARKER = "managed-by: pi-superagents";

export interface SuperpowersAgentPublishConfig {
	modelTiers?: Record<string, ModelTierSetting>;
}

function serializeFrontmatter(frontmatter: Record<string, string>, body: string): string {
	const lines = ["---"];
	for (const [key, value] of Object.entries(frontmatter)) {
		if (value === "") continue;
		lines.push(`${key}: ${value}`);
	}
	lines.push("---", "", body.trim(), "");
	return lines.join("\n");
}

function resolveModel(model: string | undefined, config: SuperpowersAgentPublishConfig): { model?: string; thinking?: string } {
	if (!model) return {};
	const tier = config.modelTiers?.[model];
	if (!tier?.model) return { model };
	return {
		model: tier.model,
		...(tier.thinking ? { thinking: tier.thinking } : {}),
	};
}

export function normalizeSuperpowersAgentForPiSubagents(content: string, config: SuperpowersAgentPublishConfig = {}): string {
	const { frontmatter, body } = parseFrontmatter(content);
	const next: Record<string, string> = {};

	for (const [key, value] of Object.entries(frontmatter)) {
		if (key === "session-mode") continue;
		if (key === "thinking") continue;
		next[key] = value;
	}

	const resolved = resolveModel(frontmatter.model, config);
	if (resolved.model) next.model = resolved.model;
	if (resolved.thinking) next.thinking = resolved.thinking;

	if (frontmatter["session-mode"] === "fork") next.defaultContext = "fork";
	else if (!next.defaultContext) next.defaultContext = "fresh";

	next.systemPromptMode = next.systemPromptMode ?? "replace";
	next.inheritProjectContext = next.inheritProjectContext ?? "false";
	next.inheritSkills = next.inheritSkills ?? "false";
	next["managed-by"] = "pi-superagents";

	return serializeFrontmatter(next, body);
}

export function publishSuperpowersRoleAgents(input: {
	bundledAgentsDir: string;
	userAgentsDir: string;
	config?: SuperpowersAgentPublishConfig;
}): string[] {
	if (!fs.existsSync(input.bundledAgentsDir)) return [];
	fs.mkdirSync(input.userAgentsDir, { recursive: true });

	const copiedOrUpdated: string[] = [];
	for (const fileName of fs.readdirSync(input.bundledAgentsDir)) {
		if (!/^sp-.*\.md$/.test(fileName)) continue;
		const sourcePath = path.join(input.bundledAgentsDir, fileName);
		const targetPath = path.join(input.userAgentsDir, fileName);
		const normalized = normalizeSuperpowersAgentForPiSubagents(fs.readFileSync(sourcePath, "utf-8"), input.config ?? {});

		if (fs.existsSync(targetPath)) {
			const current = fs.readFileSync(targetPath, "utf-8");
			if (!current.includes(MANAGED_AGENT_MARKER)) continue;
			if (current === normalized) continue;
		}

		fs.writeFileSync(targetPath, normalized, "utf-8");
		copiedOrUpdated.push(fileName);
	}
	return copiedOrUpdated;
}
```

- [ ] **Step 4: Run focused test**

Run:

```bash
cd /Users/jmbenedetto/.pi/agent/git/github.com/jmbenedetto/pi-superagents
node --experimental-strip-types --test test/unit/pi-subagents-publisher.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/agents/pi-subagents-publisher.ts test/unit/pi-subagents-publisher.test.ts
git commit -m "feat: publish superpowers agents for pi-subagents"
```

---

### Task 2: Replace inline agent-copy logic in extension startup

**Files:**
- Modify: `src/extension/index.ts`
- Test: `test/integration/slash-commands.test.ts`

- [ ] **Step 1: Write/update failing integration assertion**

In `test/integration/slash-commands.test.ts`, update the session-start test that currently expects raw copy behavior so it expects managed publishing and no old `subagent` tool registration.

Add assertions equivalent to:

```ts
assert.equal(tools.has("subagent"), false, "pi-superagents must not register the subagent tool");
assert.ok(notifications.some((n) => /Installed global Superpowers role agents for PI Sub-Agents/.test(n.message)));
```

- [ ] **Step 2: Run focused integration test to verify failure**

Run:

```bash
cd /Users/jmbenedetto/.pi/agent/git/github.com/jmbenedetto/pi-superagents
npm run test:integration -- test/integration/slash-commands.test.ts
```

Expected: FAIL if tests still expect old copy helper behavior or raw `session-mode` frontmatter.

- [ ] **Step 3: Modify `src/extension/index.ts` imports**

Remove old unused execution imports:

```ts
import { createSubagentExecutor } from "../execution/subagent-executor.ts";
import { SubagentParams } from "../shared/schemas.ts";
import type { SubagentParamsLike } from "../shared/types.ts";
import { renderSubagentResult } from "../ui/render.ts";
```

Add:

```ts
import { publishSuperpowersRoleAgents } from "../agents/pi-subagents-publisher.ts";
```

- [ ] **Step 4: Remove old unused `tool` construction**

Delete the local `const tool: ToolDefinition<typeof SubagentParams, Details> = { ... }` block and the `effectiveParallelTaskCount` helper if no longer referenced.

- [ ] **Step 5: Replace `ensureUserSuperpowersRoleAgents` implementation**

Replace direct copy logic with:

```ts
function ensureUserSuperpowersRoleAgents(packageRoot: string, config: ExtensionConfig): string[] {
	return publishSuperpowersRoleAgents({
		bundledAgentsDir: path.join(packageRoot, "agents"),
		userAgentsDir: path.join(os.homedir(), ".agents", "agents"),
		config: { modelTiers: config.superagents?.modelTiers },
	});
}
```

- [ ] **Step 6: Update session-start call site**

Change:

```ts
const copiedAgents = ensureUserSuperpowersRoleAgents(packageRoot);
```

To:

```ts
const copiedAgents = ensureUserSuperpowersRoleAgents(packageRoot, configStore.getConfig());
```

- [ ] **Step 7: Run focused tests**

Run:

```bash
cd /Users/jmbenedetto/.pi/agent/git/github.com/jmbenedetto/pi-superagents
node --experimental-strip-types --test test/unit/pi-subagents-publisher.test.ts
npm run test:integration -- test/integration/slash-commands.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/extension/index.ts test/integration/slash-commands.test.ts
git commit -m "refactor: delegate agent execution to pi-subagents only"
```

---

### Task 3: Move Superagents config to its own directory with legacy fallback

**Files:**
- Modify: `src/extension/index.ts`
- Modify: `src/extension/config-store.ts`
- Test: `test/unit/config-store.test.ts`
- Test: `test/unit/config-validation.test.ts`

- [ ] **Step 1: Write failing config-store tests**

Add tests to `test/unit/config-store.test.ts` that assert:

```ts
assert.equal(resolveUserConfigDir(), path.join(home, ".pi", "agent", "extensions", "pi-superagents"));
```

If `resolveUserConfigDir` remains private, test via `resolveRuntimeConfigPaths` and `loadRuntimeConfigState` using a temp directory with:

```json
{
  "asyncByDefault": true,
  "intercomBridge": { "mode": "auto" },
  "superagents": { "commands": { "sp-implement": { "useSubagents": true } } }
}
```

Expected behavior: Superagents extracts/uses only `superagents` instead of failing on `asyncByDefault`.

- [ ] **Step 2: Run focused tests to verify failure**

Run:

```bash
cd /Users/jmbenedetto/.pi/agent/git/github.com/jmbenedetto/pi-superagents
node --experimental-strip-types --test test/unit/config-store.test.ts test/unit/config-validation.test.ts
```

Expected: FAIL because shared Pi Subagents keys are currently unknown top-level keys.

- [ ] **Step 3: Export/dedicate config dir resolver**

In `src/extension/index.ts`, change `resolveUserConfigDir()` to:

```ts
function resolveUserConfigDir(): string {
	return path.join(os.homedir(), ".pi", "agent", "extensions", "pi-superagents");
}
```

- [ ] **Step 4: Add shared-config extraction in `config-store.ts`**

Add helper:

```ts
function extractSuperagentsConfig(raw: unknown): unknown {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
	const record = raw as Record<string, unknown>;
	const topLevelKeys = Object.keys(record);
	if (topLevelKeys.every((key) => key === "superagents")) return raw;
	if ("superagents" in record) return { superagents: record.superagents };
	return raw;
}
```

Then pass `extractSuperagentsConfig(userConfig)` into `loadEffectiveConfig`.

- [ ] **Step 5: Add legacy fallback read**

In `loadRuntimeConfigState`, if new `userConfigPath` is absent, also check:

```ts
const legacyConfigPath = path.join(path.dirname(userConfigDir), "subagent", "config.json");
const userConfig = readJsonConfig(userConfigPath) ?? extractSuperagentsConfig(readJsonConfig(legacyConfigPath));
```

Set `configPath` in the returned state to `userConfigPath`; use diagnostics to mention the legacy path only as warning if desired.

- [ ] **Step 6: Run focused tests**

Run:

```bash
cd /Users/jmbenedetto/.pi/agent/git/github.com/jmbenedetto/pi-superagents
node --experimental-strip-types --test test/unit/config-store.test.ts test/unit/config-validation.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/extension/index.ts src/extension/config-store.ts test/unit/config-store.test.ts test/unit/config-validation.test.ts
git commit -m "fix: isolate superagents config from pi-subagents config"
```

---

### Task 4: Update root prompt to use Pi Subagents semantics

**Files:**
- Modify: `src/superpowers/root-prompt.ts`
- Test: `test/unit/superpowers-root-prompt.test.ts`

- [ ] **Step 1: Write failing prompt tests**

Update tests to assert:

```ts
assert.match(prompt, /Pi Subagents uses `context: "fresh" \| "fork"`/);
assert.match(prompt, /pass `context: "fresh"` for Superpowers role agents/);
assert.doesNotMatch(prompt, /sessionMode: lineage-only/);
assert.doesNotMatch(prompt, /useTestDrivenDevelopment/);
```

- [ ] **Step 2: Run focused test to verify failure**

Run:

```bash
cd /Users/jmbenedetto/.pi/agent/git/github.com/jmbenedetto/pi-superagents
node --experimental-strip-types --test test/unit/superpowers-root-prompt.test.ts
```

Expected: FAIL because existing prompt still renders `sessionMode` and legacy wording.

- [ ] **Step 3: Change metadata renderer**

In `buildMetadata`, replace:

```ts
lines.push(`sessionMode: ${input.fork ? "fork" : "lineage-only"}`);
```

With:

```ts
lines.push(`piSubagents.context: ${input.fork ? "fork" : "fresh"}`);
```

- [ ] **Step 4: Change delegation contract wording**

Replace the delegation TDD sentence with:

```ts
"Pi Subagents uses `context: \"fresh\" | \"fork\"`; it does not support Superagents `sessionMode` or `useTestDrivenDevelopment` parameters.",
"When delegating to Superpowers role agents (`sp-recon`, `sp-research`, `sp-debug`, `sp-implementer`, `sp-spec-review`, `sp-code-review`), pass `context: \"fresh\"` unless the user explicitly requested forked context.",
"When TDD is required, include the TDD requirement in the child task text or pass `skill: \"test-driven-development\"` when that role should receive the skill.",
```

- [ ] **Step 5: Update visible summary**

Change:

```ts
configLines.push(`sessionMode: ${input.fork ? "fork" : "lineage-only"}`);
```

To:

```ts
configLines.push(`piSubagents.context: ${input.fork ? "fork" : "fresh"}`);
```

- [ ] **Step 6: Run focused test**

Run:

```bash
cd /Users/jmbenedetto/.pi/agent/git/github.com/jmbenedetto/pi-superagents
node --experimental-strip-types --test test/unit/superpowers-root-prompt.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/superpowers/root-prompt.ts test/unit/superpowers-root-prompt.test.ts
git commit -m "fix: prompt superagents to use pi-subagents context"
```

---

### Task 5: Remove stale Superagents subagent status UI

**Files:**
- Modify: `src/slash/slash-commands.ts`
- Modify: `test/integration/slash-commands.test.ts`
- Potentially remove after reference check: `src/ui/subagents-status.ts`
- Potentially remove after reference check: `src/execution/run-history.ts`
- Test: `test/unit/subagents-status.test.ts`

- [ ] **Step 1: Write failing slash-command test**

In `test/integration/slash-commands.test.ts`, replace `/subagents-status` expectations with:

```ts
assert.equal(commands.has("subagents-status"), false, "pi-superagents must not own stale subagent status UI");
assert.equal(shortcuts.has("ctrl+alt+s"), false, "pi-superagents must not bind status shortcut for old run history");
```

- [ ] **Step 2: Run focused test to verify failure**

Run:

```bash
cd /Users/jmbenedetto/.pi/agent/git/github.com/jmbenedetto/pi-superagents
npm run test:integration -- test/integration/slash-commands.test.ts
```

Expected: FAIL because `/subagents-status` is still registered.

- [ ] **Step 3: Remove status command imports**

In `src/slash/slash-commands.ts`, remove:

```ts
import { SubagentsStatusComponent } from "../ui/subagents-status.ts";
```

Remove `openSubagentsStatusOverlay` and registrations for:

```ts
pi.registerCommand("subagents-status", ...);
pi.registerShortcut("ctrl+alt+s", ...);
```

- [ ] **Step 4: Check whether old status files are now unused**

Run:

```bash
cd /Users/jmbenedetto/.pi/agent/git/github.com/jmbenedetto/pi-superagents
rg -n "subagents-status|SubagentsStatusComponent|globalRunHistory|run-history" src test
```

Expected: only tests/doc references remain. If source references remain, do not delete files yet.

- [ ] **Step 5: Delete old status tests if source is removed**

If Step 4 confirms no source references, remove or rewrite:

```bash
git rm src/ui/subagents-status.ts src/execution/run-history.ts test/unit/subagents-status.test.ts
```

If source references remain, skip deletion and add a code comment in `src/ui/subagents-status.ts` marking it deprecated and unused.

- [ ] **Step 6: Run focused tests**

Run:

```bash
cd /Users/jmbenedetto/.pi/agent/git/github.com/jmbenedetto/pi-superagents
npm run test:integration -- test/integration/slash-commands.test.ts
npm run test:unit
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/slash/slash-commands.ts test/integration/slash-commands.test.ts src/ui/subagents-status.ts src/execution/run-history.ts test/unit/subagents-status.test.ts
git commit -m "fix: remove stale superagents subagent status UI"
```

---

### Task 6: Update docs and examples for the new contract

**Files:**
- Modify: `README.md`
- Modify: `docs/configuration.md`
- Modify: `docs/parameters.md`
- Modify: `docs/skills.md`
- Modify: `CHANGELOG.md`
- Modify: `config.example.json`

- [ ] **Step 1: Update docs wording**

Document:

```md
- `pi-superagents` does not register `subagent`.
- Install `pi-subagents` separately when `useSubagents` is enabled.
- Superagents config lives at `~/.pi/agent/extensions/pi-superagents/config.json`.
- Pi Subagents config lives at `~/.pi/agent/extensions/subagent/config.json`.
- Use Pi Subagents `context: "fresh" | "fork"`; do not use Superagents `sessionMode` in subagent calls.
- Use `subagent({ action: "status" })` or `/subagents-doctor` for canonical subagent runtime status.
```

- [ ] **Step 2: Update example config**

Ensure `config.example.json` contains only Superagents keys:

```json
{
  "superagents": {
    "commands": {
      "sp-implement": {
        "useSubagents": true,
        "useTestDrivenDevelopment": true,
        "useBranches": false,
        "worktrees": { "enabled": false, "root": null }
      }
    },
    "modelTiers": {
      "cheap": { "model": "openai-codex/gpt-5.4-mini", "thinking": "minimal" },
      "balanced": { "model": "openai-codex/gpt-5.5", "thinking": "high" },
      "max": { "model": "openai-codex/gpt-5.5", "thinking": "xhigh" }
    }
  }
}
```

- [ ] **Step 3: Run docs-adjacent tests**

Run:

```bash
cd /Users/jmbenedetto/.pi/agent/git/github.com/jmbenedetto/pi-superagents
node --experimental-strip-types --test test/unit/default-config.test.ts test/unit/package-manifest.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/configuration.md docs/parameters.md docs/skills.md CHANGELOG.md config.example.json
git commit -m "docs: document pi-subagents integration contract"
```

---

### Task 7: Full validation and local runtime smoke test

**Files:**
- No source changes expected.

- [ ] **Step 1: Run formatting/type/test suite**

Run:

```bash
cd /Users/jmbenedetto/.pi/agent/git/github.com/jmbenedetto/pi-superagents
npm run qa
```

Expected: PASS.

- [ ] **Step 2: Run package list sanity check**

Run:

```bash
pi list | rg 'pi-superagents|pi-subagents'
```

Expected output includes both:

```text
git:github.com/jmbenedetto/pi-superagents
npm:pi-subagents
```

- [ ] **Step 3: Runtime doctor check**

In a Pi session with both packages enabled, run:

```ts
subagent({ action: "doctor" })
```

Expected:

```text
Subagents doctor report
...
Discovery
- agents: ...
```

And `sp-recon`, `sp-implementer`, `sp-code-review`, `sp-spec-review`, `sp-debug`, and `sp-research` are listed by:

```ts
subagent({ action: "list" })
```

- [ ] **Step 4: Foreground smoke test**

Run:

```ts
subagent({ agent: "sp-recon", task: "Reply DONE after confirming you can see this task. Do not inspect files.", context: "fresh" })
```

Expected:

```text
DONE
```

The parent must stop waiting when the tool result returns.

- [ ] **Step 5: Async smoke test**

Run:

```ts
subagent({ agent: "sp-recon", task: "Reply DONE after confirming you can see this task. Do not inspect files.", context: "fresh", async: true })
```

Then:

```ts
subagent({ action: "status", id: "<returned-run-id>" })
```

Expected: state reaches `complete` and does not remain `running` after child final answer.

- [ ] **Step 6: Commit any smoke-test doc adjustments**

If docs need final tweaks:

```bash
git add README.md docs/configuration.md docs/parameters.md docs/skills.md CHANGELOG.md
git commit -m "docs: clarify runtime smoke validation"
```

---

## Self-review

- Spec coverage:
	- Tool conflict: covered by Tasks 2 and 7.
	- Stale Superagents executor/status state: covered by Tasks 2 and 5.
	- Agent frontmatter mismatch: covered by Task 1.
	- Model tier leakage: covered by Task 1.
	- Config conflict with Pi Subagents: covered by Task 3.
	- Root prompt mismatch: covered by Task 4.
	- Docs: covered by Task 6.
	- Runtime verification: covered by Task 7.
- Placeholder scan:
	- No implementation step uses TBD/TODO/fill-in placeholders.
	- Steps include target paths, commands, expected results, and code where code is needed.
- Type consistency:
	- New publisher accepts `ModelTierSetting` from existing shared types.
	- `defaultContext` matches Pi Subagents parser.
	- Root prompt uses `context`, matching Pi Subagents schema.
