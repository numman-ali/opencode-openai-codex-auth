import { describe, it, expect } from "vitest";
import { getModelFamily } from "../lib/prompts/codex.js";

describe("Codex Module", () => {
	describe("getModelFamily", () => {
		describe("GPT-5.2 Codex family", () => {
			it("should return gpt-5.2-codex for gpt-5.2-codex", () => {
				expect(getModelFamily("gpt-5.2-codex")).toBe("gpt-5.2-codex");
			});

			it("should return gpt-5.2-codex for gpt-5.2-codex-low", () => {
				expect(getModelFamily("gpt-5.2-codex-low")).toBe("gpt-5.2-codex");
			});

			it("should return gpt-5.2-codex for gpt-5.2-codex-high", () => {
				expect(getModelFamily("gpt-5.2-codex-high")).toBe("gpt-5.2-codex");
			});

			it("should return gpt-5.2-codex for gpt-5.2-codex-xhigh", () => {
				expect(getModelFamily("gpt-5.2-codex-xhigh")).toBe("gpt-5.2-codex");
			});
		});

		describe("Codex Max family", () => {
			it("should return codex-max for gpt-5.1-codex-max", () => {
				expect(getModelFamily("gpt-5.1-codex-max")).toBe("codex-max");
			});

			it("should return codex-max for gpt-5.1-codex-max-low", () => {
				expect(getModelFamily("gpt-5.1-codex-max-low")).toBe("codex-max");
			});

			it("should return codex-max for gpt-5.1-codex-max-high", () => {
				expect(getModelFamily("gpt-5.1-codex-max-high")).toBe("codex-max");
			});

			it("should return codex-max for gpt-5.1-codex-max-xhigh", () => {
				expect(getModelFamily("gpt-5.1-codex-max-xhigh")).toBe("codex-max");
			});
		});

		describe("Codex family", () => {
			it("should return codex for gpt-5.1-codex", () => {
				expect(getModelFamily("gpt-5.1-codex")).toBe("codex");
			});

			it("should return codex for gpt-5.1-codex-low", () => {
				expect(getModelFamily("gpt-5.1-codex-low")).toBe("codex");
			});

			it("should return codex for gpt-5.1-codex-mini", () => {
				expect(getModelFamily("gpt-5.1-codex-mini")).toBe("codex");
			});

			it("should return codex for gpt-5.1-codex-mini-high", () => {
				expect(getModelFamily("gpt-5.1-codex-mini-high")).toBe("codex");
			});

			it("should return codex for codex-mini-latest", () => {
				expect(getModelFamily("codex-mini-latest")).toBe("codex");
			});
		});

		describe("GPT-5.1 general family", () => {
			it("should return gpt-5.1 for gpt-5.1", () => {
				expect(getModelFamily("gpt-5.1")).toBe("gpt-5.1");
			});

			it("should return gpt-5.1 for gpt-5.1-low", () => {
				expect(getModelFamily("gpt-5.1-low")).toBe("gpt-5.1");
			});

			it("should return gpt-5.1 for gpt-5.1-high", () => {
				expect(getModelFamily("gpt-5.1-high")).toBe("gpt-5.1");
			});

			it("should return gpt-5.1 for unknown models", () => {
				expect(getModelFamily("unknown-model")).toBe("gpt-5.1");
			});

			it("should return gpt-5.1 for empty string", () => {
				expect(getModelFamily("")).toBe("gpt-5.1");
			});
		});

		describe("Priority order", () => {
			it("should prioritize gpt-5.2-codex over gpt-5.2 general", () => {
				// "gpt-5.2-codex" also contains the substring "gpt-5.2"
				expect(getModelFamily("gpt-5.2-codex")).toBe("gpt-5.2-codex");
			});

			it("should prioritize codex-max over codex", () => {
				// Model contains both "codex-max" and "codex"
				expect(getModelFamily("gpt-5.1-codex-max")).toBe("codex-max");
			});

			it("should prioritize codex over gpt-5.1", () => {
				// Model contains both "codex" and potential gpt-5.1
				expect(getModelFamily("gpt-5.1-codex")).toBe("codex");
			});

			it("should return gpt-5.2 for gpt-5.2 general (not codex)", () => {
				// Model is gpt-5.2 but NOT codex
				expect(getModelFamily("gpt-5.2")).toBe("gpt-5.2");
				expect(getModelFamily("gpt-5.2-high")).toBe("gpt-5.2");
			});
		});
	});
});
