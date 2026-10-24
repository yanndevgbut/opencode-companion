import { describe, it, expect } from "vitest";
import {
  globalConfigDir,
  managedConfigDir,
  customConfigFile,
  isTermux,
  osKind,
  type PathEnv,
} from "../src/paths";

describe("paths resolution across operating systems", () => {
  it("resolves Linux XDG and default path", () => {
    const env: PathEnv = {
      platform: "linux",
      env: {},
      home: "/home/user",
    };
    expect(globalConfigDir(env)).toBe("/home/user/.config/opencode");
    expect(managedConfigDir(env)).toBe("/etc/opencode");
    expect(osKind(env)).toBe("linux");
  });

  it("resolves Windows ProgramData and config dir", () => {
    const env: PathEnv = {
      platform: "win32",
      env: { ProgramData: "C:\\ProgramData" },
      home: "C:\\Users\\User",
    };
    expect(globalConfigDir(env)).toBe("C:\\Users\\User\\.config\\opencode");
    expect(managedConfigDir(env)).toBe("C:\\ProgramData\\opencode");
    expect(osKind(env)).toBe("windows");
  });

  it("resolves macOS Application Support managed dir", () => {
    const env: PathEnv = {
      platform: "darwin",
      env: {},
      home: "/Users/user",
    };
    expect(managedConfigDir(env)).toBe("/Library/Application Support/opencode");
    expect(osKind(env)).toBe("macos");
  });

  it("detects Termux environment", () => {
    const env: PathEnv = {
      platform: "linux",
      env: { TERMUX_VERSION: "0.118.0", PREFIX: "/data/data/com.termux/files/usr" },
      home: "/data/data/com.termux/files/home",
    };
    expect(isTermux(env)).toBe(true);
    expect(osKind(env)).toBe("termux");
    expect(managedConfigDir(env)).toBeNull(); // /etc not accessible in Termux
  });

  it("honors OPENCODE_CONFIG custom override", () => {
    const env: PathEnv = {
      platform: "linux",
      env: { OPENCODE_CONFIG: "/custom/path/opencode.json" },
      home: "/home/user",
    };
    expect(customConfigFile(env)).toBe("/custom/path/opencode.json");
  });
});
