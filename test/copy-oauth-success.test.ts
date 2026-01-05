import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("copy-oauth-success script", () => {
  it("exports copyOAuthSuccessHtml() for reuse/testing", async () => {
    const mod = await import("../scripts/copy-oauth-success.js");
    expect(typeof mod.copyOAuthSuccessHtml).toBe("function");
  });

  it("copies oauth-success.html to the requested destination", async () => {
    const mod = await import("../scripts/copy-oauth-success.js");

    const root = await mkdtemp(join(tmpdir(), "opencode-oauth-success-"));
    const src = join(root, "oauth-success.html");
    const dest = join(root, "dist", "lib", "oauth-success.html");

    try {
      const html = "<!doctype html><html><body>ok</body></html>";
      await writeFile(src, html, "utf-8");

      await mod.copyOAuthSuccessHtml({ src, dest });

      const copied = await readFile(dest, "utf-8");
      expect(copied).toBe(html);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
