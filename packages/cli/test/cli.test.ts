import { describe, it, expect } from "vitest";
import { parseArgs } from "../src/cli";
import { findAvailablePort } from "../src/ports";

describe("CLI arguments and port selection", () => {
  it("parses CLI flags correctly", () => {
    const { opts, showHelp, showVersion } = parseArgs(["--port", "4000", "--host", "127.0.0.1", "--open", "--no-auth"]);
    expect(opts.port).toBe(4000);
    expect(opts.host).toBe("127.0.0.1");
    expect(opts.open).toBe(true);
    expect(opts.noAuth).toBe(true);
    expect(showHelp).toBe(false);
    expect(showVersion).toBe(false);
  });

  it("finds an available port", async () => {
    const port = await findAvailablePort(34567, "127.0.0.1");
    expect(port).toBeGreaterThanOrEqual(34567);
  });
});
