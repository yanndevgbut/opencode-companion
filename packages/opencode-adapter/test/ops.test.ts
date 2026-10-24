import { describe, it, expect } from "vitest";
import { applyOps, type WorkFile } from "../src/ops";

describe("configuration operations engine", () => {
  it("upserts provider and adds model cleanly", () => {
    const primaryFile: WorkFile = {
      spec: { id: "primary-1", path: "/tmp/opencode.json", role: "primary", editable: true },
      writable: true,
      exists: true,
      text: "{}",
      hash: "abc",
    };

    const res = applyOps([primaryFile], "primary-1", [
      {
        op: "upsertProvider",
        id: "test-provider",
        provider: {
          name: "Test Gateway",
          baseURL: "https://api.test.com/v1",
          apiKey: "secret-key",
        },
      },
      {
        op: "upsertModel",
        providerId: "test-provider",
        modelId: "gpt-mini",
        model: {
          name: "GPT Mini",
          limit: { context: 32000, output: 4096 },
        },
      },
      {
        op: "setDefaultModel",
        target: "model",
        value: "test-provider/gpt-mini",
      },
    ]);

    expect(res.changes).toHaveLength(1);
    const after = JSON.parse(res.changes[0].after);
    expect(after.provider["test-provider"].name).toBe("Test Gateway");
    expect(after.provider["test-provider"].models["gpt-mini"].name).toBe("GPT Mini");
    expect(after.model).toBe("test-provider/gpt-mini");
  });

  it("adds and enables/disables MCP server", () => {
    const primaryFile: WorkFile = {
      spec: { id: "primary-1", path: "/tmp/opencode.json", role: "primary", editable: true },
      writable: true,
      exists: true,
      text: "{}",
      hash: "abc",
    };

    const res1 = applyOps([primaryFile], "primary-1", [
      {
        op: "upsertMcp",
        name: "context7",
        config: {
          type: "remote",
          url: "https://mcp.context7.com/mcp",
          enabled: true,
        },
      },
    ]);
    const after1 = JSON.parse(res1.changes[0].after);
    expect(after1.mcp.context7.url).toBe("https://mcp.context7.com/mcp");
    expect(after1.mcp.context7.enabled).toBe(true);

    primaryFile.text = res1.changes[0].after;
    const res2 = applyOps([primaryFile], "primary-1", [
      {
        op: "setMcpEnabled",
        name: "context7",
        enabled: false,
      },
    ]);
    const after2 = JSON.parse(res2.changes[0].after);
    expect(after2.mcp.context7.enabled).toBe(false);
  });
});
