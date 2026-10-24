import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathApi, type PathEnv } from "./paths";

const ANSI_RE = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
export const stripAnsi = (s: string): string => s.replace(ANSI_RE, "");

export interface ExecResult {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  error?: string;
}

/** Fixed argument lists the OpenCode adapter may ever run. Nothing user-supplied is ever appended. */
export const ALLOWED_OPENCODE_ARGS: readonly (readonly string[])[] = [
  ["--version"],
  ["debug", "paths"],
  ["mcp", "list"],
];

export function isAllowedOpenCodeArgs(args: readonly string[]): boolean {
  return ALLOWED_OPENCODE_ARGS.some((a) => a.length === args.length && a.every((v, i) => v === args[i]));
}

function isExecutable(file: string, platform: NodeJS.Platform): boolean {
  try {
    const st = fs.statSync(file);
    if (!st.isFile()) return false;
    if (platform === "win32") return true;
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Locate an executable without spawning a shell. */
export function findExecutable(name: string, p: PathEnv): string | null {
  const pa = pathApi(p.platform);
  const exts = p.platform === "win32" ? (p.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";").filter(Boolean) : [""];
  const dirs = (p.env.PATH ?? p.env.Path ?? "").split(p.platform === "win32" ? ";" : ":").filter(Boolean);
  dirs.push(pa.join(p.home, ".opencode", "bin"), pa.join(p.home, ".local", "bin"));
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = pa.join(dir, name + ext.toLowerCase());
      if (isExecutable(candidate, p.platform)) return candidate;
      const upper = pa.join(dir, name + ext);
      if (upper !== candidate && isExecutable(upper, p.platform)) return upper;
    }
  }
  return null;
}

export function runBinary(
  bin: string,
  args: readonly string[],
  opts: { timeoutMs?: number; env?: NodeJS.ProcessEnv; platform?: NodeJS.Platform; cwd?: string } = {},
): Promise<ExecResult> {
  const platform = opts.platform ?? process.platform;
  const timeout = opts.timeoutMs ?? 8000;
  let file = bin;
  let argv = [...args];
  // Node refuses to spawn .cmd/.bat directly on Windows; route them through cmd.exe with constant, allowlisted args.
  if (platform === "win32" && /\.(cmd|bat)$/i.test(bin)) {
    file = process.env.ComSpec ?? "cmd.exe";
    argv = ["/d", "/s", "/c", bin, ...args];
  }
  return new Promise((resolve) => {
    execFile(
      /*turbopackIgnore: true*/
      file,
      argv,
      { timeout, windowsHide: true, maxBuffer: 1024 * 1024, env: opts.env ?? process.env, cwd: opts.cwd, shell: false },
      (err, stdout, stderr) => {
        const e = err as (NodeJS.ErrnoException & { killed?: boolean; code?: number | string }) | null;
        resolve({
          ok: !e,
          code: e ? (typeof e.code === "number" ? e.code : null) : 0,
          stdout: stripAnsi(String(stdout ?? "")),
          stderr: stripAnsi(String(stderr ?? "")),
          timedOut: Boolean(e?.killed),
          error: e ? (e.code && typeof e.code === "string" ? e.code : e.message.split("\n")[0]) : undefined,
        });
      },
    );
  });
}

export function runOpenCode(bin: string, args: readonly string[], opts?: Parameters<typeof runBinary>[2]): Promise<ExecResult> {
  if (!isAllowedOpenCodeArgs(args)) {
    return Promise.reject(new Error(`OpenCode arguments not allowlisted: ${args.join(" ")}`));
  }
  return runBinary(bin, args, opts);
}

export const basename = (p: string): string => path.basename(p);
