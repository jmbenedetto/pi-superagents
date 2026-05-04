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

import * as fs from "node:fs";
import * as path from "node:path";
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
 * Options for publishing Superpowers role agents.
 */
export interface PublishOptions {
	/** Directory containing bundled Superpowers agent markdown files */
	bundledAgentsDir: string;
	/** Directory to write normalized agents */
	userAgentsDir: string;
	/** Normalization configuration */
	config: NormalizationConfig;
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
 * @param options Publishing options with bundledAgentsDir, userAgentsDir, and config.
 * @returns Array of filenames that were written (created or updated).
 */
export function publishSuperpowersRoleAgents(options: PublishOptions): string[];

/**
 * Publish Superpowers role agents to a Pi Subagents-compatible directory (array-based signature).
 *
 * @deprecated Use object-based signature for better extensibility.
 * @param sourceAgents Array of agent markdown contents to publish.
 * @param destDir Target directory for published agents.
 * @param config Normalization configuration.
 * @returns Array of filenames that were written (created or updated).
 */
export function publishSuperpowersRoleAgents(
	sourceAgents: Array<{ name: string; content: string }>,
	destDir: string,
	config: NormalizationConfig,
): string[];

/**
 * Implementation of publishSuperpowersRoleAgents.
 */
export function publishSuperpowersRoleAgents(
	optionsOrSourceAgents: PublishOptions | Array<{ name: string; content: string }>,
	destDirOrUndefined?: string,
	configOrUndefined?: NormalizationConfig,
): string[] {
	let bundledAgentsDir: string | undefined;
	let userAgentsDir: string;
	let config: NormalizationConfig;
	let sourceAgents: Array<{ name: string; content: string }> | undefined;

	// Detect signature and extract parameters
	if (Array.isArray(optionsOrSourceAgents)) {
		// Array-based signature (backward compatibility)
		sourceAgents = optionsOrSourceAgents;
		userAgentsDir = destDirOrUndefined!;
		config = configOrUndefined!;
	} else {
		// Object-based signature
		bundledAgentsDir = optionsOrSourceAgents.bundledAgentsDir;
		userAgentsDir = optionsOrSourceAgents.userAgentsDir;
		config = optionsOrSourceAgents.config;
	}

	// If bundledAgentsDir provided, read source files
	if (bundledAgentsDir) {
		sourceAgents = [];
		const entries = fs.readdirSync(bundledAgentsDir, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.isFile() && /^sp-.*\.md$/.test(entry.name)) {
				const filePath = path.join(bundledAgentsDir, entry.name);
				const content = fs.readFileSync(filePath, "utf-8");
				sourceAgents.push({ name: entry.name, content });
			}
		}
	}

	if (!sourceAgents) {
		throw new Error("No source agents provided");
	}

	// Ensure destination directory exists
	if (!fs.existsSync(userAgentsDir)) {
		fs.mkdirSync(userAgentsDir, { recursive: true });
	}

	const changedFiles: string[] = [];

	// Process each source agent
	for (const { name, content } of sourceAgents) {
		const normalized = normalizeSuperpowersAgentForPiSubagents(content, config);
		const destPath = path.join(userAgentsDir, name);

		// Check if file exists
		if (!fs.existsSync(destPath)) {
			// File doesn't exist, write it
			fs.writeFileSync(destPath, normalized, "utf-8");
			changedFiles.push(name);
		} else {
			// File exists, check if managed
			const existing = fs.readFileSync(destPath, "utf-8");
			const isManaged = existing.includes("managed-by: pi-superagents");

			if (!isManaged) {
				// Not managed, skip
				continue;
			}

			// Managed file, check if content differs
			if (existing !== normalized) {
				// Content differs, update
				fs.writeFileSync(destPath, normalized, "utf-8");
				changedFiles.push(name);
			}
			// else: content same, skip
		}
	}

	return changedFiles;
}
