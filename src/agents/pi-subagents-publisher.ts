/**
 * Pi-Subagents-native role-agent publisher
 *
 * Key responsibilities:
 * - normalize Superpowers agent frontmatter into canonical Pi Subagents fields
 * - convert session-mode to defaultContext (lineage-only → fresh, fork → fork)
 * - resolve model tier names from config to concrete model + thinking
 * - add Pi Subagents control fields (systemPromptMode, inheritProjectContext, inheritSkills)
 * - add managed-by marker to track ownership
 * - preserve concrete model IDs unchanged
 * - write only to caller-provided destination, never overwrite non-managed files
 */

import { parseFrontmatter } from "./frontmatter.ts";

/**
 * Model tier configuration from config.json superagents.modelTiers.
 */
export interface ModelTierConfig {
	model: string;
	thinking?: string;
}

/**
 * Configuration for agent normalization.
 */
export interface NormalizationConfig {
	/** Model tier mappings from config.json superagents.modelTiers */
	modelTiers: Record<string, string | ModelTierConfig>;
}

/**
 * Normalize a Superpowers agent markdown file for Pi Subagents consumption.
 *
 * Transformations:
 * - session-mode: lineage-only → defaultContext: fresh
 * - session-mode: fork → defaultContext: fork
 * - model tier name → concrete model + thinking (if tier exists in config)
 * - adds: systemPromptMode: replace, inheritProjectContext: false, inheritSkills: false
 * - adds: managed-by: pi-superagents
 * - removes: session-mode field from output
 * - preserves: concrete model IDs unchanged, all other frontmatter fields, body content
 *
 * @param content Full markdown content with YAML frontmatter.
 * @param config Normalization configuration containing model tier mappings.
 * @returns Normalized markdown content with Pi Subagents-compatible frontmatter.
 */
export function normalizeSuperpowersAgentForPiSubagents(content: string, config: NormalizationConfig): string {
	const { frontmatter, body } = parseFrontmatter(content);

	// Build normalized frontmatter
	const normalized: Record<string, string> = {};

	// Copy all fields except session-mode (will be converted)
	for (const [key, value] of Object.entries(frontmatter)) {
		if (key !== "session-mode") {
			normalized[key] = value;
		}
	}

	// Convert session-mode to defaultContext
	const sessionMode = frontmatter["session-mode"];
	if (sessionMode === "lineage-only") {
		normalized.defaultContext = "fresh";
	} else if (sessionMode === "fork") {
		normalized.defaultContext = "fork";
	}

	// Resolve model tier to concrete model + thinking
	const modelField = frontmatter.model;
	if (modelField) {
		// Check if it's a tier name (exists in modelTiers) vs concrete model ID
		const tierConfig = config.modelTiers[modelField];
		if (tierConfig) {
			// Resolve tier to concrete model
			if (typeof tierConfig === "string") {
				normalized.model = tierConfig;
			} else {
				normalized.model = tierConfig.model;
				if (tierConfig.thinking) {
					normalized.thinking = tierConfig.thinking;
				}
			}
		}
		// else: preserve as-is (concrete model ID or unknown tier)
	}

	// Add Pi Subagents control fields
	normalized.systemPromptMode = "replace";
	normalized.inheritProjectContext = "false";
	normalized.inheritSkills = "false";

	// Add managed-by marker
	normalized["managed-by"] = "pi-superagents";

	// Reconstruct frontmatter
	let output = "---\n";
	for (const [key, value] of Object.entries(normalized)) {
		output += `${key}: ${value}\n`;
	}
	output += "---\n\n";
	output += body;

	return output;
}

/**
 * Publish Superpowers role agents to a Pi Subagents-compatible directory.
 *
 * Responsibilities:
 * - normalize agents using normalizeSuperpowersAgentForPiSubagents
 * - write only into caller-provided destination directory
 * - never silently overwrite non-managed existing files
 * - update managed files only when content changes
 *
 * @param sourceAgents Array of agent markdown contents to publish.
 * @param destDir Target directory for published agents.
 * @param config Normalization configuration.
 */
export function publishSuperpowersRoleAgents(
	sourceAgents: Array<{ name: string; content: string }>,
	destDir: string,
	config: NormalizationConfig,
): void {
	// Implementation deferred to later task if needed
	throw new Error("publishSuperpowersRoleAgents not yet implemented");
}
