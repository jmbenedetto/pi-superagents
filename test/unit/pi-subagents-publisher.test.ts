/**
 * Unit coverage for pi-subagents-publisher.
 *
 * Responsibilities:
 * - normalize Superpowers agent frontmatter for Pi Subagents consumption
 * - convert session-mode to defaultContext
 * - resolve model tier names to concrete model + thinking
 * - add Pi Subagents control fields
 * - preserve concrete model IDs unchanged
 * - publish agents to Pi Subagents directory
 * - manage file lifecycle (create, skip, update)
 */

import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import { normalizeSuperpowersAgentForPiSubagents, publishSuperpowersRoleAgents } from "../../src/agents/pi-subagents-publisher.ts";

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

void test("publishSuperpowersRoleAgents writes absent files", () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-test-"));
	try {
		const sourceAgents = [
			{
				name: "sp-test.md",
				content: `---
name: sp-test
description: Test agent
model: cheap
---

Test body.`,
			},
		];

		const config = { modelTiers: { cheap: "openai-codex/gpt-5.4-mini" } };
		const changed = publishSuperpowersRoleAgents(sourceAgents, tmpDir, config);

		assert.deepEqual(changed, ["sp-test.md"]);
		const written = fs.readFileSync(path.join(tmpDir, "sp-test.md"), "utf-8");
		assert.match(written, /managed-by: pi-superagents/);
		assert.match(written, /model: openai-codex\/gpt-5\.4-mini/);
	} finally {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	}
});

void test("publishSuperpowersRoleAgents skips non-managed files", () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-test-"));
	try {
		// Pre-create a non-managed file
		const existingContent = `---
name: sp-test
description: User's custom agent
model: custom-model
---

User content.`;
		fs.writeFileSync(path.join(tmpDir, "sp-test.md"), existingContent, "utf-8");

		const sourceAgents = [
			{
				name: "sp-test.md",
				content: `---
name: sp-test
description: Bundled agent
model: cheap
---

Bundled body.`,
			},
		];

		const config = { modelTiers: { cheap: "openai-codex/gpt-5.4-mini" } };
		const changed = publishSuperpowersRoleAgents(sourceAgents, tmpDir, config);

		assert.deepEqual(changed, []);
		const preserved = fs.readFileSync(path.join(tmpDir, "sp-test.md"), "utf-8");
		assert.equal(preserved, existingContent);
		assert.doesNotMatch(preserved, /managed-by/);
	} finally {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	}
});

void test("publishSuperpowersRoleAgents skips managed files with unchanged content", () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-test-"));
	try {
		const sourceAgent = {
			name: "sp-test.md",
			content: `---
name: sp-test
description: Test
model: cheap
---

Body.`,
		};

		const config = { modelTiers: { cheap: "openai-codex/gpt-5.4-mini" } };

		// First publish
		const firstChanged = publishSuperpowersRoleAgents([sourceAgent], tmpDir, config);
		assert.deepEqual(firstChanged, ["sp-test.md"]);

		// Second publish with same content
		const secondChanged = publishSuperpowersRoleAgents([sourceAgent], tmpDir, config);
		assert.deepEqual(secondChanged, []);
	} finally {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	}
});

void test("publishSuperpowersRoleAgents updates managed files with changed content", () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-test-"));
	try {
		const initialAgent = {
			name: "sp-test.md",
			content: `---
name: sp-test
description: Test
model: cheap
---

Initial body.`,
		};

		const config = { modelTiers: { cheap: "openai-codex/gpt-5.4-mini" } };

		// First publish
		publishSuperpowersRoleAgents([initialAgent], tmpDir, config);

		// Update source agent
		const updatedAgent = {
			name: "sp-test.md",
			content: `---
name: sp-test
description: Test updated
model: cheap
---

Updated body.`,
		};

		// Second publish with changed content
		const changed = publishSuperpowersRoleAgents([updatedAgent], tmpDir, config);
		assert.deepEqual(changed, ["sp-test.md"]);

		const updated = fs.readFileSync(path.join(tmpDir, "sp-test.md"), "utf-8");
		assert.match(updated, /description: Test updated/);
		assert.match(updated, /Updated body\./);
		assert.match(updated, /managed-by: pi-superagents/);
	} finally {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	}
});

void test("publishSuperpowersRoleAgents with bundledAgentsDir reads only sp-*.md files", () => {
	const tmpBundled = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-bundled-"));
	const tmpUser = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-user-"));
	try {
		// Create test files in bundled directory
		fs.writeFileSync(
			path.join(tmpBundled, "sp-test1.md"),
			`---
name: sp-test1
description: Test 1
model: cheap
---

Body 1.`,
			"utf-8",
		);
		fs.writeFileSync(
			path.join(tmpBundled, "sp-test2.md"),
			`---
name: sp-test2
description: Test 2
model: cheap
---

Body 2.`,
			"utf-8",
		);
		// Create files that should be ignored
		fs.writeFileSync(
			path.join(tmpBundled, "other.md"),
			`---
name: other
description: Should be ignored
model: cheap
---

Ignored.`,
			"utf-8",
		);
		fs.writeFileSync(path.join(tmpBundled, "readme.txt"), "Not a markdown file", "utf-8");

		const config = { modelTiers: { cheap: "openai-codex/gpt-5.4-mini" } };
		const changed = publishSuperpowersRoleAgents({
			bundledAgentsDir: tmpBundled,
			userAgentsDir: tmpUser,
			config,
		});

		assert.deepEqual(changed.sort(), ["sp-test1.md", "sp-test2.md"]);
		assert.ok(fs.existsSync(path.join(tmpUser, "sp-test1.md")));
		assert.ok(fs.existsSync(path.join(tmpUser, "sp-test2.md")));
		assert.ok(!fs.existsSync(path.join(tmpUser, "other.md")));
		assert.ok(!fs.existsSync(path.join(tmpUser, "readme.txt")));
	} finally {
		fs.rmSync(tmpBundled, { recursive: true, force: true });
		fs.rmSync(tmpUser, { recursive: true, force: true });
	}
});

void test("publishSuperpowersRoleAgents creates userAgentsDir if it doesn't exist", () => {
	const tmpParent = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-parent-"));
	const nonExistentDir = path.join(tmpParent, "nested", "user-agents");
	try {
		const sourceAgents = [
			{
				name: "sp-test.md",
				content: `---
name: sp-test
description: Test
model: cheap
---

Body.`,
			},
		];

		const config = { modelTiers: { cheap: "openai-codex/gpt-5.4-mini" } };
		const changed = publishSuperpowersRoleAgents(sourceAgents, nonExistentDir, config);

		assert.deepEqual(changed, ["sp-test.md"]);
		assert.ok(fs.existsSync(nonExistentDir));
		assert.ok(fs.existsSync(path.join(nonExistentDir, "sp-test.md")));
	} finally {
		fs.rmSync(tmpParent, { recursive: true, force: true });
	}
});
