#!/usr/bin/env node

import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir, copyFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { parse, modify, applyEdits } from 'jsonc-parser';

const PLUGIN_NAME = "opencode-openai-codex-auth";
const args = new Set(process.argv.slice(2));

if (args.has("--help") || args.has("-h")) {
	console.log(`Usage: ${PLUGIN_NAME} [--modern|--legacy] [--dry-run] [--no-cache-clear]\n\n` +
		"Default behavior:\n" +
		"  - Installs/updates global config at ~/.config/opencode/opencode.json\n" +
		"  - Uses modern config (variants) by default\n" +
		"  - Ensures plugin is unpinned (latest)\n" +
		"  - Clears OpenCode plugin cache\n\n" +
		"Options:\n" +
		"  --modern           Force modern config (default)\n" +
		"  --legacy           Use legacy config (older OpenCode versions)\n" +
		"  --dry-run          Show actions without writing\n" +
		"  --no-cache-clear   Skip clearing OpenCode cache\n"
	);
	process.exit(0);
}

const useLegacy = args.has("--legacy");
const useModern = args.has("--modern") || !useLegacy;
const dryRun = args.has("--dry-run");
const skipCacheClear = args.has("--no-cache-clear");

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const templatePath = join(
	repoRoot,
	"config",
	useLegacy ? "opencode-legacy.json" : "opencode-modern.json"
);

const configDir = join(homedir(), ".config", "opencode");
const configJsonPath = join(configDir, "opencode.json");
const configJsoncPath = join(configDir, "opencode.jsonc");
const cacheDir = join(homedir(), ".cache", "opencode");
const cacheNodeModules = join(cacheDir, "node_modules", PLUGIN_NAME);
const cacheBunLock = join(cacheDir, "bun.lock");
const cachePackageJson = join(cacheDir, "package.json");

function log(message) {
	console.log(message);
}

function normalizePluginList(list) {
	const entries = Array.isArray(list) ? list.filter(Boolean) : [];
	const filtered = entries.filter((entry) => {
		if (typeof entry !== "string") return true;
		return entry !== PLUGIN_NAME && !entry.startsWith(`${PLUGIN_NAME}@`);
	});
	return [...filtered, PLUGIN_NAME];
}

function formatJson(obj) {
	return `${JSON.stringify(obj, null, 2)}\n`;
}

/**
 * Determines the config file path and format
 * Priority: .jsonc > .json > (create new .json)
 * @returns {Object} { path, isJsonc, exists }
 */
function getConfigPath() {
	if (existsSync(configJsoncPath)) {
		return { path: configJsoncPath, isJsonc: true, exists: true };
	}
	if (existsSync(configJsonPath)) {
		return { path: configJsonPath, isJsonc: false, exists: true };
	}
	return { path: configJsonPath, isJsonc: false, exists: false };
}

/**
 * Reads config file (JSON or JSONC)
 * Uses jsonc-parser.parse which supports both formats
 * @param {string} filePath - Config file path
 * @returns {Promise<Object>} Parsed config object
 */
async function readConfig(filePath) {
	const content = await readFile(filePath, "utf-8");
	return parse(content);
}

/**
 * Deep merge objects
 * @param {Object} target - Target object
 * @param {Object} source - Source object
 * @returns {Object} Merged object
 */
function deepMerge(target, source) {
	const output = { ...target };
	if (isObject(target) && isObject(source)) {
		Object.keys(source).forEach(key => {
			if (isObject(source[key])) {
				if (!(key in target)) {
					Object.assign(output, { [key]: source[key] });
				} else {
					output[key] = deepMerge(target[key], source[key]);
				}
			} else {
				Object.assign(output, { [key]: source[key] });
			}
		});
	}
	return output;
}

function isObject(item) {
	return item && typeof item === 'object' && !Array.isArray(item);
}

/**
 * Writes config preserving comments and formatting
 * Uses jsonc-parser.modify + applyEdits to preserve structure
 * @param {string} filePath - Config file path
 * @param {string} originalContent - Original content (if exists)
 * @param {Object} config - Config to write
 * @param {boolean} isJsonc - Whether file is JSONC
 * @returns {Promise<void>}
 */
async function writeConfig(filePath, originalContent, config, isJsonc) {
	if (isJsonc && originalContent) {
		const formattingOptions = {
			tabSize: 2,
			insertSpaces: true,
			eol: '\n',
		};
		
		const edits = modify(originalContent, [], config, { formattingOptions });
		const result = applyEdits(originalContent, edits);
		await writeFile(filePath, result, "utf-8");
	} else {
		const formatted = formatJson(config);
		await writeFile(filePath, formatted, "utf-8");
	}
}

async function readJson(filePath) {
	const content = await readFile(filePath, "utf-8");
	return JSON.parse(content);
}

async function backupConfig(sourcePath) {
	const timestamp = new Date()
		.toISOString()
		.replace(/[:.]/g, "-")
		.replace("T", "_")
		.replace("Z", "");
	const backupPath = `${sourcePath}.bak-${timestamp}`;
	if (!dryRun) {
		await copyFile(sourcePath, backupPath);
	}
	return backupPath;
}

async function removePluginFromCachePackage() {
	if (!existsSync(cachePackageJson)) {
		return;
	}

	let cacheData;
	try {
		cacheData = await readJson(cachePackageJson);
	} catch (error) {
		log(`Warning: Could not parse ${cachePackageJson} (${error}). Skipping.`);
		return;
	}

	const sections = [
		"dependencies",
		"devDependencies",
		"peerDependencies",
		"optionalDependencies",
	];

	let changed = false;
	for (const section of sections) {
		const deps = cacheData?.[section];
		if (deps && typeof deps === "object" && PLUGIN_NAME in deps) {
			delete deps[PLUGIN_NAME];
			changed = true;
		}
	}

	if (!changed) {
		return;
	}

	if (dryRun) {
		log(`[dry-run] Would update ${cachePackageJson} to remove ${PLUGIN_NAME}`);
		return;
	}

	await writeFile(cachePackageJson, formatJson(cacheData), "utf-8");
}

async function clearCache() {
	if (skipCacheClear) {
		log("Skipping cache clear (--no-cache-clear).");
		return;
	}

	if (dryRun) {
		log(`[dry-run] Would remove ${cacheNodeModules}`);
		log(`[dry-run] Would remove ${cacheBunLock}`);
	} else {
		await rm(cacheNodeModules, { recursive: true, force: true });
		await rm(cacheBunLock, { force: true });
	}

	await removePluginFromCachePackage();
}

async function main() {
	if (!existsSync(templatePath)) {
		throw new Error(`Config template not found at ${templatePath}`);
	}

	const template = await readJson(templatePath);
	template.plugin = [PLUGIN_NAME];

	const { path: configPath, isJsonc, exists: configExists } = getConfigPath();
	
	let originalContent = null;
	if (configExists) {
		originalContent = await readFile(configPath, "utf-8");
	}

	let nextConfig = template;
	if (configExists) {
		const backupPath = await backupConfig(configPath);
		log(`${dryRun ? "[dry-run] Would create backup" : "Backup created"}: ${backupPath}`);

		try {
			const existing = await readConfig(configPath);
			const merged = { ...existing };
			merged.plugin = normalizePluginList(existing.plugin);
			
			const provider = deepMerge(
				existing.provider || {},
				{ openai: template.provider.openai }
			);
			merged.provider = provider;
			
			nextConfig = merged;
		} catch (error) {
			log(`Warning: Could not parse existing config (${error}). Replacing with template.`);
			nextConfig = template;
		}
	} else {
		const formatType = isJsonc ? "JSONC" : "JSON";
		log(`No existing config found. Creating new global config (${formatType}).`);
	}

	if (dryRun) {
		log(`[dry-run] Would write ${configPath} using ${useLegacy ? "legacy" : "modern"} config`);
	} else {
		await mkdir(configDir, { recursive: true });
		await writeConfig(configPath, originalContent, nextConfig, isJsonc);
		
		const formatInfo = configExists ? `(existing ${isJsonc ? "JSONC" : "JSON"} preserved)` : `(new ${isJsonc ? "JSONC" : "JSON"})`;
		log(`Wrote ${configPath} (${useLegacy ? "legacy" : "modern"} config ${formatInfo})`);
	}

	await clearCache();

	log("\nDone. Restart OpenCode to (re)install plugin.");
	log("Example: opencode");
	if (useLegacy) {
		log("Note: Legacy config requires OpenCode v1.0.209 or older.");
	}
}

main().catch((error) => {
	console.error(`Installer failed: ${error instanceof Error ? error.message : error}`);
	process.exit(1);
});
