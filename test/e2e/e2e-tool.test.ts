/**
 * E2E tests: pi-superagents tool ownership through the real pi runtime.
 *
 * pi-superagents registers only Superpowers review bridge tools. The canonical
 * `subagent` tool is provided by the separately installed pi-subagents package.
 */

import assert from "node:assert/strict";
import * as path from "node:path";
import { afterEach, describe, it } from "node:test";
import { tryImport } from "../support/helpers.ts";

const harness = await tryImport<any>("@marcfargas/pi-test-harness");
const available = !!harness;

const EXTENSION = path.resolve("src/extension/index.ts");

void describe("subagent tool ownership", { skip: !available ? "pi-test-harness not available" : undefined }, () => {
	const { createTestSession, when, calls, says } = harness;
	let t: any;

	afterEach(() => {
		t?.dispose();
	});

	void it("does not register the subagent tool", async () => {
		t = await createTestSession({
			extensions: [EXTENSION],
			mockTools: { bash: "ok", read: "ok", write: "ok", edit: "ok" },
		});

		await t.run(when("Call subagent", [calls("subagent", { agent: "echo", task: "Say hello", context: "fresh" }), says("Install pi-subagents separately.")]));

		assert.equal(t.events.toolResultsFor("subagent").length, 0, "pi-superagents must not register subagent");
	});
});
