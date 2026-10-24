import { describe, it, expect } from "vitest";
import {
  parseJsonc,
  setPath,
  redactText,
  restoreText,
  maskLiteral,
} from "../src/jsonc";

describe("jsonc parsing, comments, and secret redaction", () => {
  it("parses valid jsonc with comments", () => {
    const parsed = parseJsonc('{\n  // comment\n  "key": "val"\n}');
    expect(parsed.doc).toEqual({ key: "val" });
    expect(parsed.errors).toHaveLength(0);
  });

  it("preserves comments when modifying jsonc", () => {
    const raw = `{
  // Primary model setting
  "model": "anthropic/claude-sonnet-5-5",
  "autoupdate": true
}`;
    const updated = setPath(raw, ["model"], "openai/gpt-4o");
    expect(updated).toContain("// Primary model setting");
    expect(updated).toContain('"openai/gpt-4o"');
    expect(updated).toContain('"autoupdate": true');
  });

  it("redacts secrets with HMAC tag and restores them identically", () => {
    const hmacKey = Buffer.from("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", "hex");
    const raw = `{
  "provider": {
    "9router": {
      "options": {
        "apiKey": "sk-real-super-secret-key-123456"
      }
    }
  }
}`;
    const redacted = redactText(raw, hmacKey);
    expect(redacted).not.toContain("sk-real-super-secret-key-123456");
    expect(redacted).toMatch(/\{secret:[0-9a-f]{8}\}/);

    const restored = restoreText(redacted, raw, hmacKey);
    expect(restored).toContain("sk-real-super-secret-key-123456");
  });

  it("masks literal secrets appropriately", () => {
    expect(maskLiteral("1234567890abcdef")).toBe("••••cdef");
    expect(maskLiteral("short")).toBe("••••");
  });
});
