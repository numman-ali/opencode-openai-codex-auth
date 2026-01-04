import { describe, it, expect } from "vitest";
import {
  getModelConfig,
  getReasoningConfig,
} from "../lib/request/request-transformer.js";
import type { UserConfig } from "../lib/types.js";

describe("Configuration Parsing", () => {
  const providerConfig = {
    options: {
      reasoningEffort: "medium" as const,
      reasoningSummary: "auto" as const,
      textVerbosity: "medium" as const,
    },
    models: {
      "gpt-5-codex": {
        options: {
          reasoningSummary: "concise" as const,
        },
      },
      "gpt-5": {
        options: {
          reasoningEffort: "high" as const,
        },
      },
    },
  };

  const userConfig: UserConfig = {
    global: providerConfig.options || {},
    models: providerConfig.models || {},
  };

  describe("getModelConfig", () => {
    it("should merge global and model-specific config for gpt-5-codex", () => {
      const codexConfig = getModelConfig("gpt-5-codex", userConfig);

      expect(codexConfig.reasoningEffort).toBe("medium"); // from global
      expect(codexConfig.reasoningSummary).toBe("concise"); // from model override
      expect(codexConfig.textVerbosity).toBe("medium"); // from global
    });

    it("should merge global and model-specific config for gpt-5", () => {
      const gpt5Config = getModelConfig("gpt-5", userConfig);

      expect(gpt5Config.reasoningEffort).toBe("high"); // from model override
      expect(gpt5Config.reasoningSummary).toBe("auto"); // from global
      expect(gpt5Config.textVerbosity).toBe("medium"); // from global
    });

    it("should return empty config when no config provided", () => {
      const emptyConfig = getModelConfig("gpt-5-codex", {
        global: {},
        models: {},
      });

      expect(emptyConfig).toEqual({});
    });
  });

  describe("getReasoningConfig", () => {
    it("should use user settings from merged config for gpt-5-codex", () => {
      const codexConfig = getModelConfig("gpt-5-codex", userConfig);
      const reasoningConfig = getReasoningConfig("gpt-5-codex", codexConfig);

      expect(reasoningConfig.effort).toBe("medium");
      expect(reasoningConfig.summary).toBe("concise");
    });

    it("should return defaults when no config provided", () => {
      const emptyConfig = getModelConfig("gpt-5-codex", {
        global: {},
        models: {},
      });
      const defaultReasoning = getReasoningConfig("gpt-5-codex", emptyConfig);

      expect(defaultReasoning.effort).toBe("medium");
      expect(defaultReasoning.summary).toBe("auto");
    });

    it("should normalize minimal to low for lightweight models (nano/mini)", () => {
      const nanoReasoning = getReasoningConfig("gpt-5-nano", {});

      expect(nanoReasoning.effort).toBe("low");
      expect(nanoReasoning.summary).toBe("auto");
    });

    it('should normalize "minimal" to "low" for gpt-5-codex', () => {
      const codexMinimalConfig = { reasoningEffort: "minimal" as const };
      const codexMinimalReasoning = getReasoningConfig(
        "gpt-5-codex",
        codexMinimalConfig,
      );

      expect(codexMinimalReasoning.effort).toBe("low");
      expect(codexMinimalReasoning.summary).toBe("auto");
    });

    it('should normalize "minimal" to "low" for all models (minimal not supported by gpt-5.1/5.2)', () => {
      const gpt5MinimalConfig = { reasoningEffort: "minimal" as const };
      const gpt5MinimalReasoning = getReasoningConfig(
        "gpt-5",
        gpt5MinimalConfig,
      );

      expect(gpt5MinimalReasoning.effort).toBe("low");
    });

    it("should handle high effort setting", () => {
      const highConfig = { reasoningEffort: "high" as const };
      const highReasoning = getReasoningConfig("gpt-5", highConfig);

      expect(highReasoning.effort).toBe("high");
      expect(highReasoning.summary).toBe("auto");
    });

    it("should respect custom summary setting", () => {
      const detailedConfig = { reasoningSummary: "detailed" as const };
      const detailedReasoning = getReasoningConfig(
        "gpt-5-codex",
        detailedConfig,
      );

      expect(detailedReasoning.summary).toBe("detailed");
    });

    it("should default codex-mini to medium effort", () => {
      const codexMiniReasoning = getReasoningConfig("gpt-5-codex-mini", {});
      expect(codexMiniReasoning.effort).toBe("medium");
    });

    it("should clamp codex-mini minimal/low to medium", () => {
      const minimal = getReasoningConfig("gpt-5-codex-mini", {
        reasoningEffort: "minimal",
      });
      const low = getReasoningConfig("gpt-5-codex-mini-high", {
        reasoningEffort: "low",
      });

      expect(minimal.effort).toBe("medium");
      expect(low.effort).toBe("medium");
    });

    it("should keep codex-mini high effort when requested", () => {
      const high = getReasoningConfig("codex-mini-latest", {
        reasoningEffort: "high",
      });
      expect(high.effort).toBe("high");
    });
  });

  describe("Model-specific behavior", () => {
    it("should normalize minimal to low for lightweight models", () => {
      const miniReasoning = getReasoningConfig("gpt-5-mini", {});
      expect(miniReasoning.effort).toBe("low");
    });

    it("should detect codex models correctly", () => {
      const codexConfig = { reasoningEffort: "minimal" as const };
      const codexReasoning = getReasoningConfig("gpt-5-codex", codexConfig);
      expect(codexReasoning.effort).toBe("low"); // normalized
    });

    it("should handle standard gpt-5 model", () => {
      const gpt5Reasoning = getReasoningConfig("gpt-5", {});
      expect(gpt5Reasoning.effort).toBe("medium");
    });
  });
});
