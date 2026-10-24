import { findExecutable, runOpenCode } from "./exec";
import { pathApi, type PathEnv } from "./paths";

export interface OpenCodeInstall {
  installed: boolean;
  binPath: string | null;
  source: "OPENCODE_BIN" | "PATH" | null;
  version: string | null;
  versionRaw?: string;
  /** Config/data/state directories reported by `opencode debug paths`, when that command works. */
  reportedPaths?: Record<string, string>;
  problem?: string;
}

const VERSION_RE = /\bv?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)\b/;

export function parseVersion(output: string): string | null {
  const m = VERSION_RE.exec(output);
  return m?.[1] ?? null;
}

/** Parses the `key   value` table printed by `opencode debug paths`. */
export function parseDebugPaths(output: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of output.split(/\r?\n/)) {
    const m = /^([a-z_]+)\s{2,}(\S.*)$/.exec(line.trim());
    if (m?.[1] && m[2]) out[m[1]] = m[2].trim();
  }
  return out;
}

export async function detectOpenCode(p: PathEnv): Promise<OpenCodeInstall> {
  const pa = pathApi(p.platform);
  let binPath: string | null = null;
  let source: OpenCodeInstall["source"] = null;
  const override = p.env.OPENCODE_BIN;
  if (override) {
    if (pa.isAbsolute(override)) {
      binPath = override;
      source = "OPENCODE_BIN";
    } else {
      return { installed: false, binPath: null, source: null, version: null, problem: "OPENCODE_BIN must be an absolute path." };
    }
  } else {
    binPath = findExecutable("opencode", p);
    if (binPath) source = "PATH";
  }
  if (!binPath) {
    return { installed: false, binPath: null, source: null, version: null, problem: "The `opencode` executable was not found on PATH." };
  }
  const v = await runOpenCode(binPath, ["--version"], { timeoutMs: 8000, platform: p.platform });
  if (!v.ok) {
    return {
      installed: false,
      binPath,
      source,
      version: null,
      problem: v.timedOut ? "`opencode --version` timed out." : `\`opencode --version\` failed${v.error ? ` (${v.error})` : ""}.`,
    };
  }
  const version = parseVersion(v.stdout || v.stderr);
  const result: OpenCodeInstall = { installed: true, binPath, source, version, versionRaw: (v.stdout || v.stderr).trim().slice(0, 200) };
  const dp = await runOpenCode(binPath, ["debug", "paths"], { timeoutMs: 8000, platform: p.platform });
  if (dp.ok) {
    const parsed = parseDebugPaths(dp.stdout);
    if (Object.keys(parsed).length) result.reportedPaths = parsed;
  }
  return result;
}
