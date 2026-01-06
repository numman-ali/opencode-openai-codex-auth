#!/usr/bin/env node

import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir, copyFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { homedir, platform } from "node:os";
import { createInterface } from "node:readline";

const PLUGIN_NAME = "opencode-openai-codex-auth";
const args = new Set(process.argv.slice(2));

if (args.has("--help") || args.has("-h")) {
	console.log(`Usage: ${PLUGIN_NAME} [--modern|--legacy] [--dry-run] [--no-cache-clear]\n` +
		`       ${PLUGIN_NAME} --uninstall [--all] [--dry-run]\n\n` +
		"Default behavior:\n" +
		"  - Installs/updates global config at ~/.config/opencode/opencode.json\n" +
		"  - Uses modern config (variants) by default\n" +
		"  - Ensures plugin is unpinned (latest)\n" +
		"  - Clears OpenCode plugin cache\n\n" +
		"Options:\n" +
		"  --modern           Force modern config (default)\n" +
		"  --legacy           Use legacy config (older OpenCode versions)\n" +
		"  --dry-run          Show actions without writing\n" +
		"  --no-cache-clear   Skip clearing OpenCode cache\n\n" +
		"Uninstall:\n" +
		"  --uninstall        Remove plugin from config and clear cache\n" +
		"  --all              Also remove auth tokens, plugin config, logs, and cache files\n"
	);
	process.exit(0);
}

const useLegacy = args.has("--legacy");
const useModern = args.has("--modern") || !useLegacy;
const dryRun = args.has("--dry-run");
const skipCacheClear = args.has("--no-cache-clear");
const uninstall = args.has("--uninstall");
const uninstallAll = args.has("--all");

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const templatePath = join(
	repoRoot,
	"config",
	useLegacy ? "opencode-legacy.json" : "opencode-modern.json"
);

const configDir = join(homedir(), ".config", "opencode");
const configPath = join(configDir, "opencode.json");
const configPathJsonc = join(configDir, "opencode.jsonc");
const cacheDir = join(homedir(), ".cache", "opencode");
const cacheNodeModules = join(cacheDir, "node_modules", PLUGIN_NAME);
const cacheBunLock = join(cacheDir, "bun.lock");
const cachePackageJson = join(cacheDir, "package.json");

// Plugin-specific paths (for uninstall --all)
const pluginDataDir = join(homedir(), ".opencode");
const pluginConfigPath = join(pluginDataDir, "openai-codex-auth-config.json");
const pluginAuthPath = join(pluginDataDir, "auth", "openai.json");
const pluginLogsDir = join(pluginDataDir, "logs", "codex-plugin");
const pluginCacheDir = join(pluginDataDir, "cache");

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

function removePluginFromList(list) {
	if (!Array.isArray(list)) return [];
	return list.filter((entry) => {
		if (typeof entry !== "string") return true;
		return entry !== PLUGIN_NAME && !entry.startsWith(`${PLUGIN_NAME}@`);
	});
}

async function promptConfirm(question) {
	const rl = createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	return new Promise((resolve) => {
		rl.question(`${question} [y/N] `, (answer) => {
			rl.close();
			resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
		});
	});
}

async function removePluginFromConfig(filePath) {
	if (!existsSync(filePath)) {
		return false;
	}

	let configData;
	try {
		const content = await readFile(filePath, "utf-8");
		// Handle JSONC: strip comments but preserve // in strings (URLs, etc.)
		// Only strip // comments that are outside of quoted strings
		const jsonContent = content
			.replace(/("(?:[^"\\]|\\.)*")|\/\/.*$/gm, (match, quoted) => quoted || "")
			.replace(/("(?:[^"\\]|\\.)*")|\/\*[\s\S]*?\*\//g, (match, quoted) => quoted || "");
		configData = JSON.parse(jsonContent);
	} catch (error) {
		log(`Warning: Could not parse ${filePath} (${error}). Skipping.`);
		return false;
	}

	let changed = false;

	// Remove plugin from plugin list
	if (Array.isArray(configData.plugin)) {
		const originalLength = configData.plugin.length;
		configData.plugin = removePluginFromList(configData.plugin);
		if (configData.plugin.length !== originalLength) {
			changed = true;
		}
	}

	// Remove provider.openai configuration
	if (configData.provider?.openai) {
		delete configData.provider.openai;
		changed = true;
		// Clean up empty provider object
		if (Object.keys(configData.provider).length === 0) {
			delete configData.provider;
		}
	}

	if (!changed) {
		log(`No plugin entries found in ${filePath}`);
		return false;
	}

	if (dryRun) {
		log(`[dry-run] Would update ${filePath} to remove plugin`);
		return true;
	}

	// Create backup before modifying
	const backupPath = await backupConfig(filePath);
	log(`Backup created: ${backupPath}`);

	await writeFile(filePath, formatJson(configData), "utf-8");
	log(`Updated ${filePath} (removed plugin)`);
	return true;
}

async function removePluginData() {
	const removals = [
		{ path: pluginConfigPath, desc: "plugin config" },
		{ path: pluginAuthPath, desc: "OAuth tokens" },
		{ path: pluginLogsDir, desc: "debug logs", recursive: true },
	];

	// Cache files to remove
	const cacheFiles = [
		"codex-instructions.md",
		"codex-instructions-meta.json",
		"codex-max-instructions.md",
		"codex-max-instructions-meta.json",
		"gpt-5.1-instructions.md",
		"gpt-5.1-instructions-meta.json",
		"gpt-5.2-instructions.md",
		"gpt-5.2-instructions-meta.json",
		"gpt-5.2-codex-instructions.md",
		"gpt-5.2-codex-instructions-meta.json",
		"opencode-codex.txt",
		"opencode-codex-meta.json",
	];

	for (const { path, desc, recursive } of removals) {
		if (!existsSync(path)) {
			continue;
		}
		if (dryRun) {
			log(`[dry-run] Would remove ${desc}: ${path}`);
		} else {
			await rm(path, { recursive: recursive || false, force: true });
			log(`Removed ${desc}: ${path}`);
		}
	}

	// Remove cache files individually
	for (const file of cacheFiles) {
		const filePath = join(pluginCacheDir, file);
		if (!existsSync(filePath)) {
			continue;
		}
		if (dryRun) {
			log(`[dry-run] Would remove cache file: ${filePath}`);
		} else {
			await rm(filePath, { force: true });
			log(`Removed cache file: ${filePath}`);
		}
	}
}

async function runUninstall() {
	log(`\nUninstalling ${PLUGIN_NAME}...\n`);

	// Remove from config files
	const jsonUpdated = await removePluginFromConfig(configPath);
	const jsoncUpdated = await removePluginFromConfig(configPathJsonc);

	if (!jsonUpdated && !jsoncUpdated) {
		log("No configuration files needed updating.");
	}

	// Clear OpenCode plugin cache
	log("\nClearing plugin cache...");
	if (dryRun) {
		log(`[dry-run] Would remove ${cacheNodeModules}`);
		log(`[dry-run] Would remove ${cacheBunLock}`);
	} else {
		await rm(cacheNodeModules, { recursive: true, force: true });
		await rm(cacheBunLock, { force: true });
	}
	await removePluginFromCachePackage();

	// Handle --all flag for complete removal
	if (uninstallAll) {
		log("\nRemoving plugin data (--all)...");
		await removePluginData();
	} else {
		log("\nNote: OAuth tokens and plugin data were preserved.");
		log("Use --all to also remove auth tokens, config, logs, and cache files.");
	}

	log("\n" + "=".repeat(60));
	log("Uninstall complete.");
	log("=".repeat(60));
	log("\nThe following have been removed:");
	log("  - Plugin entry from OpenCode config");
	log("  - OpenAI provider configuration");
	log("  - Cached plugin files\n");

	if (uninstallAll) {
		log("Additional data removed (--all):");
		log("  - OAuth tokens (~/.opencode/auth/openai.json)");
		log("  - Plugin config (~/.opencode/openai-codex-auth-config.json)");
		log("  - Debug logs (~/.opencode/logs/codex-plugin/)");
		log("  - Cached instructions (~/.opencode/cache/)\n");
	}

	log("To reinstall, run:");
	log(`  npx -y ${PLUGIN_NAME}@latest\n`);
}

async function main() {
	// Handle uninstall mode
	if (uninstall) {
		await runUninstall();
		return;
	}

	if (!existsSync(templatePath)) {
		throw new Error(`Config template not found at ${templatePath}`);
	}

	const template = await readJson(templatePath);
	template.plugin = [PLUGIN_NAME];

	let nextConfig = template;
	if (existsSync(configPath)) {
		const backupPath = await backupConfig(configPath);
		log(`${dryRun ? "[dry-run] Would create backup" : "Backup created"}: ${backupPath}`);

		try {
			const existing = await readJson(configPath);
			const merged = { ...existing };
			merged.plugin = normalizePluginList(existing.plugin);
			const provider = (existing.provider && typeof existing.provider === "object")
				? { ...existing.provider }
				: {};
			provider.openai = template.provider.openai;
			merged.provider = provider;
			nextConfig = merged;
		} catch (error) {
			log(`Warning: Could not parse existing config (${error}). Replacing with template.`);
			nextConfig = template;
		}
	} else {
		log("No existing config found. Creating new global config.");
	}

	if (dryRun) {
		log(`[dry-run] Would write ${configPath} using ${useLegacy ? "legacy" : "modern"} config`);
	} else {
		await mkdir(configDir, { recursive: true });
		await writeFile(configPath, formatJson(nextConfig), "utf-8");
		log(`Wrote ${configPath} (${useLegacy ? "legacy" : "modern"} config)`);
	}

	await clearCache();

	log("\nDone. Restart OpenCode to (re)install the plugin.");
	log("Example: opencode");
	if (useLegacy) {
		log("Note: Legacy config requires OpenCode v1.0.209 or older.");
	}
}

main().catch((error) => {
	console.error(`Installer failed: ${error instanceof Error ? error.message : error}`);
	process.exit(1);
});
