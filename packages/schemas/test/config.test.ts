import { describe, it, expect } from "vitest";
import {
  mcpLocalSchema,
  mcpRemoteSchema,
  providerPatchSchema,
  modelConfigSchema,
  opSchema,
  validateAgainstOpenCodeSchema,
} from "../src";

describe("schemas validation", () => {
  it("validates local MCP server correctly", () => {
    const valid = mcpLocalSchema.safeParse({
      type: "local",
      command: ["npx", "-y", "test-mcp"],
      enabled: true,
    });
    expect(valid.success).toBe(true);

    const invalid = mcpLocalSchema.safeParse({
      type: "local",
      command: [],
    });
    expect(invalid.success).toBe(false);
  });

  it("validates remote MCP server correctly", () => {
    const valid = mcpRemoteSchema.safeParse({
      type: "remote",
      url: "https://mcp.context7.com/mcp",
      headers: { CONTEXT7_API_KEY: "{env:KEY}" },
      enabled: true,
    });
    expect(valid.success).toBe(true);

    const invalid = mcpRemoteSchema.safeParse({
      type: "remote",
      url: "not-a-url",
    });
    expect(invalid.success).toBe(false);
  });

  it("validates provider patch and masks", () => {
    const res = providerPatchSchema.safeParse({
      name: "9Router",
      baseURL: "https://api.9router.com/v1",
      apiKey: "sk-test123456789",
    });
    expect(res.success).toBe(true);

    const modelRes = modelConfigSchema.safeParse({
      name: "Test Model",
      limit: { context: 128000, output: 4096 },
    });
    expect(modelRes.success).toBe(true);

    const opRes = opSchema.safeParse({
      op: "removeProvider",
      id: "9router",
    });
    expect(opRes.success).toBe(true);
  });

  it("validates against bundled official OpenCode schema", () => {
    const validDoc = {
      $schema: "https://opencode.ai/config.json",
      model: "anthropic/claude-3-5-sonnet",
      mcp: {
        test: {
          type: "remote",
          url: "https://example.com/mcp",
          enabled: true,
        },
      },
    };
    const issues = validateAgainstOpenCodeSchema(validDoc);
    expect(issues.filter((i) => i.level === "error")).toHaveLength(0);
  });
});
