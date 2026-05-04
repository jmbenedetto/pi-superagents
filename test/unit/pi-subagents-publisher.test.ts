/**
 * Unit coverage for pi-subagents-publisher.
 *
 * Responsibilities:
 * - normalize Superpowers agent frontmatter for Pi Subagents consumption
 * - convert session-mode to defaultContext
 * - resolve model tier names to concrete model + thinking
 * - add Pi Subagents control fields
 * - preserve concrete model IDs unchanged
 */

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
	assert.match(output, /managed-by: pi-superagents/);
	assert.doesNotMatch(output, /session-mode:/);
});

void test("converts fork session-mode to fork defaultContext", () => {
	const source = `---
name: sp-implementer
description: Implementation specialist
model: balanced
session-mode: fork
---

You implement.`;

	const output = normalizeSuperpowersAgentForPiSubagents(source, {
		modelTiers: { balanced: "openai-codex/gpt-5.4" },
	});

	assert.match(output, /defaultContext: fork/);
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

void test("handles model tier as string", () => {
	const source = `---
name: sp-test
description: Test agent
model: cheap
---

Test body.`;

	const output = normalizeSuperpowersAgentForPiSubagents(source, {
		modelTiers: { cheap: "openai-codex/gpt-5.4-mini" },
	});

	assert.match(output, /model: openai-codex\/gpt-5\.4-mini/);
	assert.doesNotMatch(output, /thinking:/);
});

void test("preserves other frontmatter fields", () => {
	const source = `---
name: sp-recon
description: Reconnaissance
model: cheap
tools: read, grep
maxSubagentDepth: 0
skills: analyze, explore
extensions: security-scanner
---

Body content.`;

	const output = normalizeSuperpowersAgentForPiSubagents(source, {
		modelTiers: { cheap: { model: "openai-codex/gpt-5.4-mini", thinking: "minimal" } },
	});

	assert.match(output, /tools: read, grep/);
	assert.match(output, /maxSubagentDepth: 0/);
	assert.match(output, /skills: analyze, explore/);
	assert.match(output, /extensions: security-scanner/);
	assert.match(output, /Body content\./);
});

void test("handles missing model tier gracefully", () => {
	const source = `---
name: sp-test
description: Test agent
model: nonexistent-tier
---

Body.`;

	const output = normalizeSuperpowersAgentForPiSubagents(source, {
		modelTiers: { cheap: "openai-codex/gpt-5.4-mini" },
	});

	// Should preserve the tier name unchanged
	assert.match(output, /model: nonexistent-tier/);
});

void test("handles agent without session-mode", () => {
	const source = `---
name: sp-basic
description: Basic agent
model: cheap
---

Body.`;

	const output = normalizeSuperpowersAgentForPiSubagents(source, {
		modelTiers: { cheap: "openai-codex/gpt-5.4-mini" },
	});

	assert.match(output, /systemPromptMode: replace/);
	assert.match(output, /inheritProjectContext: false/);
	assert.match(output, /inheritSkills: false/);
	assert.match(output, /managed-by: pi-superagents/);
	assert.doesNotMatch(output, /defaultContext:/);
});

void test("preserves body content exactly", () => {
	const source = `---
name: sp-test
description: Test
model: cheap
---

First line.

Second paragraph with **markdown**.

\`\`\`typescript
const code = "block";
\`\`\``;

	const output = normalizeSuperpowersAgentForPiSubagents(source, {
		modelTiers: { cheap: "openai-codex/gpt-5.4-mini" },
	});

	assert.match(output, /First line\./);
	assert.match(output, /Second paragraph with \*\*markdown\*\*\./);
	assert.match(output, /const code = "block";/);
});
