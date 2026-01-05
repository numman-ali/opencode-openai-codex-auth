import { promises as fs } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function normalizePathForCompare(path) {
	const resolved = resolve(path);
	return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function getDefaultPaths() {
	const src = join(__dirname, "..", "lib", "oauth-success.html");
	const dest = join(__dirname, "..", "dist", "lib", "oauth-success.html");
	return { src, dest };
}

export async function copyOAuthSuccessHtml(options = {}) {
	const defaults = getDefaultPaths();
	const src = options.src ?? defaults.src;
	const dest = options.dest ?? defaults.dest;

	await fs.mkdir(dirname(dest), { recursive: true });
	await fs.copyFile(src, dest);

	return { src, dest };
}

const isDirectRun = (() => {
	if (!process.argv[1]) return false;
	return normalizePathForCompare(process.argv[1]) === normalizePathForCompare(__filename);
})();

if (isDirectRun) {
	await copyOAuthSuccessHtml();
}
