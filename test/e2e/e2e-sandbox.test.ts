/**
 * E2E test: extension loading and tool registration.
 *
 * Uses pi-test-harness createTestSession to verify that pi-superagents
 * loads correctly without owning the canonical Pi Subagents `subagent` tool.
 */

import assert from "node:assert/strict";
import * as path from "node:path";
import { afterEach, describe, it } from "node:test";
import { tryImport } from "../support/helpers.ts";

const harness = await tryImport<any>("@marcfargas/pi-test-harness");
const available = !!harness;

const EXTENSION = path.resolve("src/extension/index.ts");

void describe("extension loading", { skip: !available ? "pi-test-harness not available" : undefined }, () => {
	const { createTestSession, when, calls, says } = harness;
	let t: any;

	afterEach(() => t?.dispose());

	void it("loads extension without registering the subagent tool", async () => {
		t = await createTestSession({
			extensions: [EXTENSION],
			mockTools: { bash: "ok", read: "ok", write: "ok", edit: "ok" },
		});

		await t.run(when("Try delegated recon", [calls("subagent", { agent: "sp-recon", task: "hello" }), says("Pi Subagents owns that tool.")]));

		assert.equal(t.events.toolResultsFor("subagent").length, 0, "pi-superagents must not register subagent");
	});
});
