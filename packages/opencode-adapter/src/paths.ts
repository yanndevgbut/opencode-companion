import path from "node:path";

export interface PathEnv {
  platform: NodeJS.Platform;
  env: Record<string, string | undefined>;
  home: string;
}

export function pathApi(platform: NodeJS.Platform): path.PlatformPath {
  return platform === "win32" ? path.win32 : path.posix;
}

/** Android Termux exposes `TERMUX_VERSION` and a `PREFIX` under /data/data/com.termux. */
export function isTermux(p: Pick<PathEnv, "env" | "platform">): boolean {
  const prefix = p.env.PREFIX ?? "";
  return Boolean(p.env.TERMUX_VERSION) || prefix.includes("com.termux");
}

export type OsKind = "linux" | "macos" | "windows" | "termux" | "other";
export function osKind(p: Pick<PathEnv, "env" | "platform">): OsKind {
  if (isTermux(p)) return "termux";
  if (p.platform === "win32") return "windows";
  if (p.platform === "darwin") return "macos";
  if (p.platform === "linux") return "linux";
  return "other";
}

/** Documented global location: `$XDG_CONFIG_HOME/opencode` or `~/.config/opencode`. */
export function globalConfigDir(p: PathEnv): string {
  const pa = pathApi(p.platform);
  const xdg = p.env.XDG_CONFIG_HOME;
  return pa.join(xdg && pa.isAbsolute(xdg) ? xdg : pa.join(p.home, ".config"), "opencode");
}

/** Admin-controlled directory documented by OpenCode (read-only for Companion). */
export function managedConfigDir(p: PathEnv): string | null {
  const pa = pathApi(p.platform);
  if (p.platform === "darwin") return "/Library/Application Support/opencode";
  if (p.platform === "win32") {
    const base = p.env.ProgramData ?? p.env.PROGRAMDATA;
    return base ? pa.join(base, "opencode") : null;
  }
  if (isTermux(p)) return null; // /etc is not available inside Termux
  return "/etc/opencode";
}

export function customConfigFile(p: PathEnv): string | null {
  const v = p.env.OPENCODE_CONFIG;
  return v && pathApi(p.platform).isAbsolute(v) ? v : null;
}

export function customConfigDir(p: PathEnv): string | null {
  const v = p.env.OPENCODE_CONFIG_DIR;
  return v && pathApi(p.platform).isAbsolute(v) ? v : null;
}

export function companionHome(p: PathEnv): string {
  const pa = pathApi(p.platform);
  const v = p.env.OCC_HOME;
  return v && pa.isAbsolute(v) ? v : pa.join(p.home, ".opencode-companion");
}

export const CONFIG_FILE_NAMES = ["opencode.json", "opencode.jsonc"] as const;

/** Only these basenames may ever be read or written inside a config directory. */
export function isAllowedConfigBasename(name: string): boolean {
  return (CONFIG_FILE_NAMES as readonly string[]).includes(name);
}
